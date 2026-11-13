import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../database/migration-runner.ts';
import type { ListedEpisode } from './jikan.client.ts';
import type { EpisodeListAttempt } from './episode.retry.ts';

export interface StoredEpisode {
  malId: number;
  number: number;
  title: string;
  titleVi: string | null;
  aired: string | null;
  synopsis: string | null;
  synopsisVi: string | null;
  // False until the episode page was fetched, so an empty synopsis is fetched once, not every run.
  synopsisFetched: boolean;
}

export const EPISODE_STORE = Symbol('EpisodeStore');

export interface EpisodeStore {
  // MAL ids of every title with an ok match, lowest first.
  matchedMalIds(): Promise<number[]>;
  find(malId: number): Promise<Map<number, StoredEpisode>>;
  // When the list page of each entry was last read, for the entries that were.
  listAttempts(malIds: number[]): Promise<Map<number, EpisodeListAttempt>>;
  saveListAttempt(attempt: EpisodeListAttempt): Promise<void>;
  // Adds new episodes and refreshes the listed fields. A changed title drops its stale translation.
  saveListed(malId: number, episodes: ListedEpisode[]): Promise<void>;
  saveSynopsis(
    malId: number,
    number: number,
    synopsis: string | null,
  ): Promise<void>;
  saveTranslation(
    malId: number,
    number: number,
    fields: { titleVi?: string; synopsisVi?: string },
  ): Promise<void>;
}

export class MemoryEpisodeStore implements EpisodeStore {
  readonly rows = new Map<string, StoredEpisode>();
  readonly attempts = new Map<number, EpisodeListAttempt>();
  matched: number[] = [];

  private key = (malId: number, number: number) => `${malId}:${number}`;

  async matchedMalIds(): Promise<number[]> {
    return [...this.matched];
  }

  async find(malId: number): Promise<Map<number, StoredEpisode>> {
    const found = new Map<number, StoredEpisode>();
    for (const row of this.rows.values()) {
      if (row.malId === malId) found.set(row.number, { ...row });
    }
    return found;
  }

  async listAttempts(
    malIds: number[],
  ): Promise<Map<number, EpisodeListAttempt>> {
    const found = new Map<number, EpisodeListAttempt>();
    for (const malId of malIds) {
      const row = this.attempts.get(malId);
      if (row) found.set(malId, { ...row });
    }
    return found;
  }

  async saveListAttempt(attempt: EpisodeListAttempt): Promise<void> {
    this.attempts.set(attempt.malId, { ...attempt });
  }

  async saveListed(malId: number, episodes: ListedEpisode[]): Promise<void> {
    for (const { number, title, aired } of episodes) {
      const row = this.rows.get(this.key(malId, number));
      this.rows.set(this.key(malId, number), {
        malId,
        number,
        synopsis: null,
        synopsisVi: null,
        synopsisFetched: false,
        ...row,
        title,
        aired,
        titleVi: row && row.title === title ? row.titleVi : null,
      });
    }
  }

  async saveSynopsis(
    malId: number,
    number: number,
    synopsis: string | null,
  ): Promise<void> {
    const row = this.rows.get(this.key(malId, number));
    if (row) {
      this.rows.set(this.key(malId, number), {
        ...row,
        synopsis,
        synopsisVi: synopsis === row.synopsis ? row.synopsisVi : null,
        synopsisFetched: true,
      });
    }
  }

  async saveTranslation(
    malId: number,
    number: number,
    fields: { titleVi?: string; synopsisVi?: string },
  ): Promise<void> {
    const row = this.rows.get(this.key(malId, number));
    if (row) this.rows.set(this.key(malId, number), { ...row, ...fields });
  }
}

interface EpisodeRow {
  mal_id: number;
  episode_number: number;
  title: string;
  title_vi: string | null;
  aired: string | null;
  synopsis: string | null;
  synopsis_vi: string | null;
  synopsis_fetched_at: Date | null;
}

@Injectable()
export class PostgresEpisodeStore implements EpisodeStore {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async matchedMalIds(): Promise<number[]> {
    const { rows } = await this.pool.query<{ mal_id: number }>(
      `select distinct mal_id from title_mal
        where status = 'ok' and mal_id is not null order by mal_id`,
    );
    return rows.map((row) => row.mal_id);
  }

  async find(malId: number): Promise<Map<number, StoredEpisode>> {
    const { rows } = await this.pool.query<EpisodeRow>(
      `select mal_id, episode_number, title, title_vi, to_char(aired, 'YYYY-MM-DD') as aired,
              synopsis, synopsis_vi, synopsis_fetched_at
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
          synopsisFetched: row.synopsis_fetched_at !== null,
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
      `insert into episode_info (mal_id, episode_number, title, title_alt, aired)
       select $1::int, n, t, a, d::date
         from unnest($2::int[], $3::text[], $4::text[], $5::text[]) as e(n, t, a, d)
       on conflict (mal_id, episode_number) do update set
         title_vi = case when episode_info.title = excluded.title
                         then episode_info.title_vi end,
         title = excluded.title,
         title_alt = excluded.title_alt,
         aired = excluded.aired`,
      [
        malId,
        episodes.map((e) => e.number),
        episodes.map((e) => e.title),
        episodes.map((e) => e.titleAlt),
        episodes.map((e) => e.aired),
      ],
    );
  }

  async saveSynopsis(
    malId: number,
    number: number,
    synopsis: string | null,
  ): Promise<void> {
    await this.pool.query(
      `update episode_info set
         synopsis_vi = case when synopsis is not distinct from $3
                            then synopsis_vi end,
         synopsis = $3,
         synopsis_fetched_at = now()
       where mal_id = $1 and episode_number = $2`,
      [malId, number, synopsis],
    );
  }

  async saveTranslation(
    malId: number,
    number: number,
    fields: { titleVi?: string; synopsisVi?: string },
  ): Promise<void> {
    await this.pool.query(
      `update episode_info set
         title_vi = coalesce($3, title_vi),
         synopsis_vi = coalesce($4, synopsis_vi),
         translated_at = now()
       where mal_id = $1 and episode_number = $2`,
      [malId, number, fields.titleVi ?? null, fields.synopsisVi ?? null],
    );
  }
}
