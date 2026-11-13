import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../database/migration-runner.ts';
import type { TitleInput } from './contract.ts';
import {
  MATCHED_REFRESH_BELOW,
  MATCHER_VERSION,
  type MissStatus,
  type OverviewStatus,
  type TitleStatus,
} from './retry.ts';
import type { MatcherName, MatchScope } from './tmdb/matcher.ts';
import type { MatchedTitle } from './tmdb/sync.ts';

export interface StoredTitle {
  slug: string;
  status: TitleStatus;
  tmdbId: number | null;
  tmdbSeason: number | null;
  matchScope: MatchScope | null;
  backdropPath: string | null;
  backdropLang: string | null;
  posterPath: string | null;
  posterLang: string | null;
  reason: string | null;
  matcherVersion: number;
  attemptedAt: Date;
  sourceName: string | null;
  sourceYear: number | null;
  sourceEpisodeCount: number | null;
  matchedBy: MatcherName | null;
  overview: string | null;
  overviewLang: OverviewLang | null;
  overviewTranslated: boolean;
  overviewStatus: OverviewStatus | null;
  overviewAttemptedAt: Date | null;
}

export type OverviewLang = 'vi' | 'en';

// `text` is always Vietnamese. `lang` is the language TMDB wrote it in, so `en` means DeepSeek translated it.
export type OverviewResult =
  | { status: 'ok'; text: string; lang: OverviewLang; translated: boolean }
  | { status: 'none' | 'failed' };

export type TitleSource = Pick<
  TitleInput,
  'slug' | 'name' | 'year' | 'episodeCount'
>;

export type MatchedArt = Pick<MatchedTitle, 'title' | 'episodes'>;

export const ART_STORE = Symbol('ArtStore');

export interface ArtStore {
  find(slugs: string[]): Promise<Map<string, StoredTitle>>;
  episodesPage(
    slug: string,
    from: number,
    limit: number,
  ): Promise<Map<number, string>>;
  saveMatched(art: MatchedArt): Promise<void>;
  saveMiss(
    source: TitleSource,
    status: MissStatus,
    reason: string,
  ): Promise<void>;
  saveOverview(
    slug: string,
    tmdbId: number,
    result: OverviewResult,
  ): Promise<void>;
}

function overviewColumns(result: OverviewResult) {
  return result.status === 'ok'
    ? {
        overview: result.text,
        overviewLang: result.lang,
        overviewTranslated: result.translated,
        overviewStatus: result.status,
      }
    : {
        overview: null,
        overviewLang: null,
        overviewTranslated: false,
        overviewStatus: result.status,
      };
}

interface TitleRow {
  source_slug: string;
  status: TitleStatus;
  tmdb_id: number | null;
  tmdb_season: number | null;
  match_scope: MatchScope;
  backdrop_path: string | null;
  backdrop_lang: string | null;
  poster_path: string | null;
  poster_lang: string | null;
  reason: string | null;
  matcher_version: number;
  attempted_at: Date;
  source_name: string | null;
  source_year: number | null;
  source_episode_count: number | null;
  matched_by: MatcherName | null;
  overview: string | null;
  overview_lang: OverviewLang | null;
  overview_translated: boolean;
  overview_status: OverviewStatus | null;
  overview_attempted_at: Date | null;
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
      `select source_slug, status, tmdb_id, tmdb_season, match_scope,
              backdrop_path, backdrop_lang, poster_path, poster_lang, reason, matcher_version,
              attempted_at, source_name, source_year, source_episode_count,
              matched_by, overview, overview_lang, overview_translated,
              overview_status, overview_attempted_at
         from title_art where source_slug = any($1::text[])`,
      [slugs],
    );
    for (const row of rows) {
      found.set(row.source_slug, {
        slug: row.source_slug,
        status: row.status,
        tmdbId: row.tmdb_id,
        tmdbSeason: row.tmdb_season,
        matchScope: row.status === 'matched' ? row.match_scope : null,
        backdropPath: row.backdrop_path,
        backdropLang: row.backdrop_lang,
        posterPath: row.poster_path,
        posterLang: row.poster_lang,
        reason: row.reason,
        matcherVersion: row.matcher_version,
        attemptedAt: row.attempted_at,
        sourceName: row.source_name,
        sourceYear: row.source_year,
        sourceEpisodeCount: row.source_episode_count,
        matchedBy: row.matched_by,
        overview: row.overview,
        overviewLang: row.overview_lang,
        overviewTranslated: row.overview_translated,
        overviewStatus: row.overview_status,
        overviewAttemptedAt: row.overview_attempted_at,
      });
    }
    return found;
  }

  async episodesPage(
    slug: string,
    from: number,
    limit: number,
  ): Promise<Map<number, string>> {
    const { rows } = await this.pool.query<{
      episode_number: number;
      still_path: string;
    }>(
      `select episode_number, still_path from episode_art
        where source_slug = $1 and episode_number >= $2
        order by episode_number limit $3`,
      [slug, from, limit],
    );
    return new Map(rows.map((r) => [r.episode_number, r.still_path]));
  }

  async saveMatched({ title, episodes }: MatchedArt): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const written = await client.query(
        `insert into title_art
           (source_slug, status, tmdb_id, tmdb_season, match_scope,
            backdrop_path, backdrop_lang, poster_path, poster_lang, reason,
            matcher_version, attempted_at, source_name, source_year,
            source_episode_count, matched_by)
         values ($1, 'matched', $2, $3, $14, $4, $5, $6, $7, null, $8, now(),
                 $9, $10, $11, $12)
         on conflict (source_slug) do update set
           status = excluded.status,
           tmdb_id = excluded.tmdb_id,
           tmdb_season = excluded.tmdb_season,
           match_scope = excluded.match_scope,
           backdrop_path = excluded.backdrop_path,
           backdrop_lang = excluded.backdrop_lang,
           poster_path = excluded.poster_path,
           poster_lang = excluded.poster_lang,
           reason = null,
           matcher_version = excluded.matcher_version,
           attempted_at = now(),
           source_name = excluded.source_name,
           source_year = excluded.source_year,
           source_episode_count = excluded.source_episode_count,
           matched_by = excluded.matched_by,
           overview = case when title_art.tmdb_id = excluded.tmdb_id
             then title_art.overview end,
           overview_lang = case when title_art.tmdb_id = excluded.tmdb_id
             then title_art.overview_lang end,
           overview_translated = coalesce(title_art.tmdb_id = excluded.tmdb_id
             and title_art.overview_translated, false),
           overview_status = case when title_art.tmdb_id = excluded.tmdb_id
             then title_art.overview_status end,
           overview_attempted_at = case when title_art.tmdb_id = excluded.tmdb_id
             then title_art.overview_attempted_at end
         where title_art.status <> 'matched'
            or title_art.matcher_version < $13
         returning source_slug`,
        [
          title.source_slug,
          title.tmdb_id,
          title.tmdb_season,
          title.backdrop_path,
          title.backdrop_lang,
          title.poster_path,
          title.poster_lang,
          MATCHER_VERSION,
          title.source_name,
          title.source_year,
          title.source_episode_count,
          title.matched_by,
          MATCHED_REFRESH_BELOW,
          title.match_scope,
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
    source: TitleSource,
    status: MissStatus,
    reason: string,
  ): Promise<void> {
    await this.pool.query(
      `insert into title_art
         (source_slug, status, reason, matcher_version, attempted_at,
          source_name, source_year, source_episode_count)
       values ($1, $2, $3, $4, now(), $5, $6, $7)
       on conflict (source_slug) do update set
         status = excluded.status,
         reason = excluded.reason,
         matcher_version = excluded.matcher_version,
         attempted_at = now(),
         source_name = excluded.source_name,
         source_year = excluded.source_year,
         source_episode_count = excluded.source_episode_count,
         matched_by = null
       where title_art.status <> 'matched'`,
      [
        source.slug,
        status,
        reason,
        MATCHER_VERSION,
        source.name,
        source.year ?? null,
        source.episodeCount ?? null,
      ],
    );
  }

  async saveOverview(
    slug: string,
    tmdbId: number,
    result: OverviewResult,
  ): Promise<void> {
    const columns = overviewColumns(result);
    await this.pool.query(
      `update title_art set
         overview = $3,
         overview_lang = $4,
         overview_translated = $5,
         overview_status = $6,
         overview_attempted_at = now()
       where source_slug = $1
         and status = 'matched'
         and tmdb_id = $2
         and overview_status is distinct from 'ok'`,
      [
        slug,
        tmdbId,
        columns.overview,
        columns.overviewLang,
        columns.overviewTranslated,
        columns.overviewStatus,
      ],
    );
  }
}
