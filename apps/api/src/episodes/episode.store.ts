import type pg from 'pg';
import type { ListedEpisode } from './episode.parser.ts';

export interface StoredEpisode {
  malId: number;
  number: number;
  title: string;
  titleVi: string | null;
  synopsis: string | null;
  synopsisVi: string | null;
  // False until the episode page was fetched, so an empty synopsis is fetched once, not every run.
  synopsisFetched: boolean;
}

export interface EpisodeStore {
  // MAL ids of every title with an ok match, lowest first.
  matchedMalIds(): Promise<number[]>;
  find(malId: number): Promise<Map<number, StoredEpisode>>;
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

  async saveListed(malId: number, episodes: ListedEpisode[]): Promise<void> {
    for (const { number, title } of episodes) {
      const row = this.rows.get(this.key(malId, number));
      this.rows.set(this.key(malId, number), {
        malId,
        number,
        synopsis: null,
        synopsisVi: null,
        synopsisFetched: false,
        ...row,
        title,
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
  synopsis: string | null;
  synopsis_vi: string | null;
  synopsis_fetched_at: Date | null;
}

export class PostgresEpisodeStore implements EpisodeStore {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
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
      `select mal_id, episode_number, title, title_vi, synopsis, synopsis_vi,
              synopsis_fetched_at
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
          synopsis: row.synopsis,
          synopsisVi: row.synopsis_vi,
          synopsisFetched: row.synopsis_fetched_at !== null,
        },
      ]),
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
