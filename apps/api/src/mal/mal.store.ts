import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../database/migration-runner.ts';
import type { MalAiring, MalSeason, MalStartSeason } from '../art/contract.ts';
import type { MalStatus } from './mal.retry.ts';

export const MAL_STORE = Symbol('MalStore');

export type MalMatchedBy = 'score' | 'jev';

export interface StoredMal {
  slug: string;
  status: MalStatus;
  malId: number | null;
  score: number | null;
  voters: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  airing: MalAiring | null;
  episodes: number | null;
  startDate: string | null;
  startSeason: MalStartSeason | null;
  trailerYoutubeId: string | null;
  // False for a row saved before start dates were stored, so it is fetched once more.
  datesKnown: boolean;
  // What the matcher chose and how sure it was, so a wrong match can be spotted by eye.
  matchedTitle: string | null;
  matchScore: number | null;
  matchedBy: MalMatchedBy | null;
  matcherVersion: number;
  reason: string | null;
  attemptedAt: Date;
  fetchedAt: Date | null;
}

export interface MalStore {
  find(slugs: string[]): Promise<Map<string, StoredMal>>;
  save(row: StoredMal): Promise<void>;
  // Records a failed refresh without touching the stored numbers, so it is not retried on every lookup.
  touch(slug: string): Promise<void>;
}

interface MalRow {
  source_slug: string;
  status: MalStatus;
  mal_id: number | null;
  mal_score: string | null;
  mal_voters: number | null;
  mal_rank: number | null;
  mal_popularity: number | null;
  mal_members: number | null;
  mal_airing: MalAiring | null;
  mal_episodes: number | null;
  mal_start_date: string | null;
  mal_start_year: number | null;
  mal_start_season: MalSeason | null;
  mal_trailer_youtube_id: string | null;
  mal_dates_known: boolean;
  matched_title: string | null;
  match_score: string | null;
  matched_by: MalMatchedBy | null;
  matcher_version: number;
  reason: string | null;
  attempted_at: Date;
  fetched_at: Date | null;
}

const toNumber = (value: string | null) =>
  value === null ? null : Number(value);

@Injectable()
export class PostgresMalStore implements MalStore {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async find(slugs: string[]): Promise<Map<string, StoredMal>> {
    const found = new Map<string, StoredMal>();
    if (slugs.length === 0) return found;
    const { rows } = await this.pool.query<MalRow>(
      `select source_slug, status, mal_id, mal_score, mal_voters, mal_rank,
              mal_popularity, mal_members, mal_airing, mal_episodes,
              mal_start_date, mal_start_year, mal_start_season, mal_trailer_youtube_id,
              mal_dates_known, matched_title, match_score, matched_by, matcher_version, reason,
              attempted_at, fetched_at
         from title_mal where source_slug = any($1::text[])`,
      [slugs],
    );
    for (const row of rows) {
      found.set(row.source_slug, {
        slug: row.source_slug,
        status: row.status,
        malId: row.mal_id,
        score: toNumber(row.mal_score),
        voters: row.mal_voters,
        rank: row.mal_rank,
        popularity: row.mal_popularity,
        members: row.mal_members,
        airing: row.mal_airing,
        episodes: row.mal_episodes,
        startDate: row.mal_start_date,
        startSeason:
          row.mal_start_year !== null && row.mal_start_season !== null
            ? { year: row.mal_start_year, season: row.mal_start_season }
            : null,
        trailerYoutubeId: row.mal_trailer_youtube_id,
        datesKnown: row.mal_dates_known,
        matchedTitle: row.matched_title,
        matchScore: toNumber(row.match_score),
        matchedBy: row.matched_by,
        matcherVersion: row.matcher_version,
        reason: row.reason,
        attemptedAt: row.attempted_at,
        fetchedAt: row.fetched_at,
      });
    }
    return found;
  }

  async save(row: StoredMal): Promise<void> {
    await this.pool.query(
      `insert into title_mal
         (source_slug, status, mal_id, mal_score, mal_voters, mal_rank,
          mal_popularity, mal_members, mal_airing, mal_episodes,
          mal_start_date, mal_start_year, mal_start_season,
          mal_trailer_youtube_id, mal_dates_known,
          matched_title, match_score, matched_by, matcher_version, reason,
          attempted_at, fetched_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18, $19, $20, $21, $22)
       on conflict (source_slug) do update set
         status = excluded.status,
         mal_id = excluded.mal_id,
         mal_score = excluded.mal_score,
         mal_voters = excluded.mal_voters,
         mal_rank = excluded.mal_rank,
         mal_popularity = excluded.mal_popularity,
         mal_members = excluded.mal_members,
         mal_airing = excluded.mal_airing,
         mal_episodes = excluded.mal_episodes,
         mal_start_date = excluded.mal_start_date,
         mal_start_year = excluded.mal_start_year,
         mal_start_season = excluded.mal_start_season,
         mal_trailer_youtube_id = excluded.mal_trailer_youtube_id,
         mal_dates_known = excluded.mal_dates_known,
         matched_title = excluded.matched_title,
         match_score = excluded.match_score,
         matched_by = excluded.matched_by,
         matcher_version = excluded.matcher_version,
         reason = excluded.reason,
         attempted_at = excluded.attempted_at,
         fetched_at = excluded.fetched_at`,
      [
        row.slug,
        row.status,
        row.malId,
        row.score,
        row.voters,
        row.rank,
        row.popularity,
        row.members,
        row.airing,
        row.episodes,
        row.startDate,
        row.startSeason?.year ?? null,
        row.startSeason?.season ?? null,
        row.trailerYoutubeId,
        row.datesKnown,
        row.matchedTitle,
        row.matchScore,
        row.matchedBy,
        row.matcherVersion,
        row.reason,
        row.attemptedAt,
        row.fetchedAt,
      ],
    );
  }

  async touch(slug: string): Promise<void> {
    await this.pool.query(
      `update title_mal set attempted_at = now() where source_slug = $1`,
      [slug],
    );
  }
}
