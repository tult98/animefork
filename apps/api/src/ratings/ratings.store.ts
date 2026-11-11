import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { CLOCK, systemClock, type Clock } from '../common/clock.ts';
import type { AvsSubmission } from '../art/contract.ts';
import { PG_POOL } from '../database/migration-runner.ts';
import { AVS_MIN_REWRITE_MS, type StoredRatings } from './ratings.ts';

export const RATINGS_STORE = Symbol('RatingsStore');

export interface RatingsStore {
  find(slugs: string[]): Promise<Map<string, StoredRatings>>;
  saveAvs(items: AvsSubmission[]): Promise<void>;
}

function oneDecimal(score: number): number {
  return Math.round(score * 10) / 10;
}

// A later item for the same slug wins, which also keeps one statement from touching a row twice.
function lastPerSlug(items: AvsSubmission[]): AvsSubmission[] {
  return [...new Map(items.map((item) => [item.slug, item])).values()];
}

@Injectable()
export class MemoryRatingsStore implements RatingsStore {
  readonly rows = new Map<string, StoredRatings>();
  private readonly now: Clock;

  constructor(@Inject(CLOCK) now: Clock = systemClock) {
    this.now = now;
  }

  async find(slugs: string[]): Promise<Map<string, StoredRatings>> {
    const found = new Map<string, StoredRatings>();
    for (const slug of slugs) {
      const row = this.rows.get(slug);
      if (row) found.set(slug, { ...row });
    }
    return found;
  }

  async saveAvs(items: AvsSubmission[]): Promise<void> {
    const now = this.now();
    for (const item of lastPerSlug(items)) {
      const existing = this.rows.get(item.slug);
      if (
        existing?.avsFetchedAt &&
        now.getTime() - existing.avsFetchedAt.getTime() < AVS_MIN_REWRITE_MS
      ) {
        continue;
      }
      this.rows.set(item.slug, {
        slug: item.slug,
        avsScore: oneDecimal(item.score),
        avsVoters: item.voters,
        avsFetchedAt: now,
        quality: item.quality ?? existing?.quality ?? null,
      });
    }
  }
}

interface RatingsRow {
  source_slug: string;
  avs_score: string | null;
  avs_voters: number | null;
  avs_fetched_at: Date | null;
  quality: string | null;
}

@Injectable()
export class PostgresRatingsStore implements RatingsStore {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async find(slugs: string[]): Promise<Map<string, StoredRatings>> {
    const found = new Map<string, StoredRatings>();
    if (slugs.length === 0) return found;
    const { rows } = await this.pool.query<RatingsRow>(
      `select source_slug, avs_score, avs_voters, avs_fetched_at, quality
         from title_ratings where source_slug = any($1::text[])`,
      [slugs],
    );
    for (const row of rows) {
      found.set(row.source_slug, {
        slug: row.source_slug,
        avsScore: row.avs_score === null ? null : Number(row.avs_score),
        avsVoters: row.avs_voters,
        avsFetchedAt: row.avs_fetched_at,
        quality: row.quality,
      });
    }
    return found;
  }

  async saveAvs(items: AvsSubmission[]): Promise<void> {
    const unique = lastPerSlug(items);
    if (unique.length === 0) return;
    await this.pool.query(
      `insert into title_ratings
         (source_slug, avs_score, avs_voters, avs_fetched_at, quality, updated_at)
       select slug, score, voters, now(), quality, now()
         from unnest($1::text[], $2::numeric[], $3::int[], $4::text[])
              as t(slug, score, voters, quality)
       on conflict (source_slug) do update set
         avs_score = excluded.avs_score,
         avs_voters = excluded.avs_voters,
         avs_fetched_at = now(),
         quality = coalesce(excluded.quality, title_ratings.quality),
         updated_at = now()
       where title_ratings.avs_fetched_at is null
          or title_ratings.avs_fetched_at < now() - ($5::int * interval '1 millisecond')`,
      [
        unique.map((i) => i.slug),
        unique.map((i) => oneDecimal(i.score)),
        unique.map((i) => i.voters),
        unique.map((i) => i.quality ?? null),
        AVS_MIN_REWRITE_MS,
      ],
    );
  }
}
