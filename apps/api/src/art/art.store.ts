import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { CLOCK, systemClock, type Clock } from '../common/clock.ts';
import { PG_POOL } from '../database/migration-runner.ts';
import { MATCHER_VERSION, type MissStatus, type TitleStatus } from './retry.ts';
import type { MatchedTitle } from './tmdb/sync.ts';

export interface StoredTitle {
  slug: string;
  status: TitleStatus;
  tmdbId: number | null;
  tmdbSeason: number | null;
  backdropPath: string | null;
  backdropLang: string | null;
  reason: string | null;
  matcherVersion: number;
  attemptedAt: Date;
}

export type MatchedArt = Pick<MatchedTitle, 'title' | 'episodes'>;

export const ART_STORE = Symbol('ArtStore');

export interface ArtStore {
  find(slugs: string[]): Promise<Map<string, StoredTitle>>;
  episodes(slug: string): Promise<Map<number, string>>;
  saveMatched(art: MatchedArt): Promise<void>;
  saveMiss(slug: string, status: MissStatus, reason: string): Promise<void>;
}

@Injectable()
export class MemoryArtStore implements ArtStore {
  readonly titles = new Map<string, StoredTitle>();
  readonly stills = new Map<string, Map<number, string>>();
  private readonly now: Clock;

  constructor(@Inject(CLOCK) now: Clock = systemClock) {
    this.now = now;
  }

  async find(slugs: string[]): Promise<Map<string, StoredTitle>> {
    const found = new Map<string, StoredTitle>();
    for (const slug of slugs) {
      const row = this.titles.get(slug);
      if (row) found.set(slug, { ...row });
    }
    return found;
  }

  async episodes(slug: string): Promise<Map<number, string>> {
    return new Map(this.stills.get(slug));
  }

  async saveMatched({ title, episodes }: MatchedArt): Promise<void> {
    if (this.titles.get(title.source_slug)?.status === 'matched') return;
    this.titles.set(title.source_slug, {
      slug: title.source_slug,
      status: 'matched',
      tmdbId: title.tmdb_id,
      tmdbSeason: title.tmdb_season,
      backdropPath: title.backdrop_path,
      backdropLang: title.backdrop_lang,
      reason: null,
      matcherVersion: MATCHER_VERSION,
      attemptedAt: this.now(),
    });
    this.stills.set(
      title.source_slug,
      new Map(episodes.map((e) => [e.episode_number, e.still_path])),
    );
  }

  async saveMiss(
    slug: string,
    status: MissStatus,
    reason: string,
  ): Promise<void> {
    if (this.titles.get(slug)?.status === 'matched') return;
    this.titles.set(slug, {
      slug,
      status,
      tmdbId: null,
      tmdbSeason: null,
      backdropPath: null,
      backdropLang: null,
      reason,
      matcherVersion: MATCHER_VERSION,
      attemptedAt: this.now(),
    });
  }
}

interface TitleRow {
  source_slug: string;
  status: TitleStatus;
  tmdb_id: number | null;
  tmdb_season: number | null;
  backdrop_path: string | null;
  backdrop_lang: string | null;
  reason: string | null;
  matcher_version: number;
  attempted_at: Date;
}

@Injectable()
export class PostgresArtStore implements ArtStore {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async find(slugs: string[]): Promise<Map<string, StoredTitle>> {
    const found = new Map<string, StoredTitle>();
    if (slugs.length === 0) return found;
    const { rows } = await this.pool.query<TitleRow>(
      `select source_slug, status, tmdb_id, tmdb_season, backdrop_path,
              backdrop_lang, reason, matcher_version, attempted_at
         from title_art where source_slug = any($1::text[])`,
      [slugs],
    );
    for (const row of rows) {
      found.set(row.source_slug, {
        slug: row.source_slug,
        status: row.status,
        tmdbId: row.tmdb_id,
        tmdbSeason: row.tmdb_season,
        backdropPath: row.backdrop_path,
        backdropLang: row.backdrop_lang,
        reason: row.reason,
        matcherVersion: row.matcher_version,
        attemptedAt: row.attempted_at,
      });
    }
    return found;
  }

  async episodes(slug: string): Promise<Map<number, string>> {
    const { rows } = await this.pool.query<{
      episode_number: number;
      still_path: string;
    }>(
      `select episode_number, still_path from episode_art
        where source_slug = $1 order by episode_number`,
      [slug],
    );
    return new Map(rows.map((r) => [r.episode_number, r.still_path]));
  }

  async saveMatched({ title, episodes }: MatchedArt): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const written = await client.query(
        `insert into title_art
           (source_slug, status, tmdb_id, tmdb_season, backdrop_path,
            backdrop_lang, reason, matcher_version, attempted_at)
         values ($1, 'matched', $2, $3, $4, $5, null, $6, now())
         on conflict (source_slug) do update set
           status = excluded.status,
           tmdb_id = excluded.tmdb_id,
           tmdb_season = excluded.tmdb_season,
           backdrop_path = excluded.backdrop_path,
           backdrop_lang = excluded.backdrop_lang,
           reason = null,
           matcher_version = excluded.matcher_version,
           attempted_at = now()
         where title_art.status <> 'matched'
         returning source_slug`,
        [
          title.source_slug,
          title.tmdb_id,
          title.tmdb_season,
          title.backdrop_path,
          title.backdrop_lang,
          MATCHER_VERSION,
        ],
      );
      if (written.rowCount && episodes.length > 0) {
        await client.query(
          `insert into episode_art (source_slug, episode_number, still_path)
           select $1, * from unnest($2::int[], $3::text[])
           on conflict (source_slug, episode_number) do update set
             still_path = excluded.still_path`,
          [
            title.source_slug,
            episodes.map((e) => e.episode_number),
            episodes.map((e) => e.still_path),
          ],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveMiss(
    slug: string,
    status: MissStatus,
    reason: string,
  ): Promise<void> {
    await this.pool.query(
      `insert into title_art
         (source_slug, status, reason, matcher_version, attempted_at)
       values ($1, $2, $3, $4, now())
       on conflict (source_slug) do update set
         status = excluded.status,
         reason = excluded.reason,
         matcher_version = excluded.matcher_version,
         attempted_at = now()
       where title_art.status <> 'matched'`,
      [slug, status, reason, MATCHER_VERSION],
    );
  }
}
