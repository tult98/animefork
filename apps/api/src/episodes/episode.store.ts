import type pg from 'pg';
import type { ListedEpisode } from './episode.client.ts';
import type { EpisodeListAttempt } from './episode.retry.ts';

export interface StoredEpisode {
  malId: number;
  number: number;
  title: string;
  titleVi: string | null;
  aired: string | null;
  synopsis: string | null;
  synopsisVi: string | null;
}

export const EPISODE_STORE = Symbol('EpisodeStore');

export interface EpisodeStore {
  find(malId: number): Promise<Map<number, StoredEpisode>>;
  // When the list page of each entry was last read, for the entries that were.
  listAttempts(malIds: number[]): Promise<Map<number, EpisodeListAttempt>>;
  saveListAttempt(attempt: EpisodeListAttempt): Promise<void>;
  // Adds new episodes and refreshes the listed fields. A changed title or synopsis drops its stale translation.
  saveListed(malId: number, episodes: ListedEpisode[]): Promise<void>;
  saveTranslation(
    malId: number,
    number: number,
    titleVi: string,
  ): Promise<void>;
  saveSynopsisTranslation(
    malId: number,
    number: number,
    synopsisVi: string,
  ): Promise<void>;
}

interface EpisodeRow {
  mal_id: number;
  episode_number: number;
  title: string;
  title_vi: string | null;
  aired: string | null;
  synopsis: string | null;
  synopsis_vi: string | null;
}

export class PostgresEpisodeStore implements EpisodeStore {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async find(malId: number): Promise<Map<number, StoredEpisode>> {
    const { rows } = await this.pool.query<EpisodeRow>(
      `select mal_id, episode_number, title, title_vi, to_char(aired, 'YYYY-MM-DD') as aired,
              synopsis, synopsis_vi
         from episode_info where mal_id = $1`,
      [malId],
    );
    return new Map(
      rows.map((row) => [
        row.episode_number,
        {
          malId: row.mal_id,
          number: row.episode_number,
          title: row.title,
          titleVi: row.title_vi,
          aired: row.aired,
          synopsis: row.synopsis,
          synopsisVi: row.synopsis_vi,
        },
      ]),
    );
  }

  async listAttempts(
    malIds: number[],
  ): Promise<Map<number, EpisodeListAttempt>> {
    if (malIds.length === 0) return new Map();
    const { rows } = await this.pool.query<{
      mal_id: number;
      status: EpisodeListAttempt['status'];
      airing: EpisodeListAttempt['airing'];
      attempted_at: Date;
    }>(
      `select mal_id, status, airing, attempted_at
         from episode_list_sync where mal_id = any($1::int[])`,
      [malIds],
    );
    return new Map(
      rows.map((row) => [
        row.mal_id,
        {
          malId: row.mal_id,
          status: row.status,
          airing: row.airing,
          attemptedAt: row.attempted_at,
        },
      ]),
    );
  }

  async saveListAttempt(attempt: EpisodeListAttempt): Promise<void> {
    await this.pool.query(
      `insert into episode_list_sync (mal_id, status, airing, attempted_at)
       values ($1, $2, $3, $4)
       on conflict (mal_id) do update set
         status = excluded.status,
         airing = excluded.airing,
         attempted_at = excluded.attempted_at`,
      [attempt.malId, attempt.status, attempt.airing, attempt.attemptedAt],
    );
  }

  async saveListed(malId: number, episodes: ListedEpisode[]): Promise<void> {
    if (episodes.length === 0) return;
    await this.pool.query(
      `insert into episode_info (mal_id, episode_number, title, title_alt, aired, synopsis)
       select $1::int, n, t, a, d::date, y
         from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[]) as e(n, t, a, d, y)
       on conflict (mal_id, episode_number) do update set
         title_vi = case when episode_info.title = excluded.title
                         then episode_info.title_vi end,
         synopsis_vi = case when episode_info.synopsis is not distinct from excluded.synopsis
                            then episode_info.synopsis_vi end,
         title = excluded.title,
         title_alt = excluded.title_alt,
         aired = excluded.aired,
         synopsis = excluded.synopsis`,
      [
        malId,
        episodes.map((e) => e.number),
        episodes.map((e) => e.title),
        episodes.map((e) => e.titleAlt),
        episodes.map((e) => e.aired),
        episodes.map((e) => e.synopsis),
      ],
    );
  }

  async saveTranslation(
    malId: number,
    number: number,
    titleVi: string,
  ): Promise<void> {
    await this.pool.query(
      `update episode_info set
         title_vi = $3,
         translated_at = now()
       where mal_id = $1 and episode_number = $2`,
      [malId, number, titleVi],
    );
  }

  async saveSynopsisTranslation(
    malId: number,
    number: number,
    synopsisVi: string,
  ): Promise<void> {
    await this.pool.query(
      `update episode_info set synopsis_vi = $3
       where mal_id = $1 and episode_number = $2`,
      [malId, number, synopsisVi],
    );
  }
}
