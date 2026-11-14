import { randomInt } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backfillTrailers } from '../../src/scripts/backfill-trailers.ts';
import { createTrailerClient } from '../../src/mal/trailer.client.ts';
import { TEST_DATABASE_URL } from '../test-database.ts';

describe('backfill-trailers', () => {
  let pool: pg.Pool;
  beforeEach(() => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  });
  afterEach(async () => {
    await pool.end();
  });

  it('stores the trailer Tenrai knows and leaves titles without one or with a failed lookup unset', async () => {
    const run = randomInt(1_000_000_000);
    const rows = [
      { source_slug: `a-found-${run}`, mal_id: randomInt(1, 2_000_000_000) },
      { source_slug: `b-none-${run}`, mal_id: randomInt(1, 2_000_000_000) },
      { source_slug: `c-failed-${run}`, mal_id: randomInt(1, 2_000_000_000) },
    ];
    await pool.query(
      `insert into title_mal (source_slug, status, mal_id, fetched_at, attempted_at)
       select slug, 'ok', mal_id, '2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z'
         from unnest($1::text[], $2::int[]) as t(slug, mal_id)`,
      [rows.map((r) => r.source_slug), rows.map((r) => r.mal_id)],
    );
    fetchMock
      .get(`https://tenrai.test/v1/anime/${rows[0]!.mal_id}/full`, {
        data: { trailer: { youtube_id: 'abc123' } },
      })
      .get(`https://tenrai.test/v1/anime/${rows[1]!.mal_id}/full`, {
        data: { trailer: { youtube_id: null } },
      })
      .get(`https://tenrai.test/v1/anime/${rows[2]!.mal_id}/full`, 503);

    const summary = await backfillTrailers(rows, {
      pool,
      trailers: createTrailerClient({ baseUrl: 'https://tenrai.test/v1' }),
      dryRun: false,
      delayMs: 0,
      log: () => {},
    });

    expect(summary).toEqual({
      lookedUp: 3,
      found: 1,
      none: 1,
      failed: 1,
      written: 1,
    });
    const stored = await pool.query(
      `select source_slug, mal_trailer_youtube_id, fetched_at, attempted_at
         from title_mal where source_slug = any($1) order by source_slug`,
      [rows.map((r) => r.source_slug)],
    );
    const at = new Date('2026-03-01T00:00:00Z');
    expect(stored.rows).toEqual([
      {
        source_slug: `a-found-${run}`,
        mal_trailer_youtube_id: 'abc123',
        fetched_at: at,
        attempted_at: at,
      },
      {
        source_slug: `b-none-${run}`,
        mal_trailer_youtube_id: null,
        fetched_at: at,
        attempted_at: at,
      },
      {
        source_slug: `c-failed-${run}`,
        mal_trailer_youtube_id: null,
        fetched_at: at,
        attempted_at: at,
      },
    ]);
  });

  it('looks the trailer up but writes nothing on a dry run', async () => {
    const slug = `dry-run-${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await pool.query(
      `insert into title_mal (source_slug, status, mal_id, fetched_at)
       values ($1, 'ok', $2, now())`,
      [slug, malId],
    );
    fetchMock.get(`https://tenrai.test/v1/anime/${malId}/full`, {
      data: { trailer: { youtube_id: 'abc123' } },
    });

    const summary = await backfillTrailers(
      [{ source_slug: slug, mal_id: malId }],
      {
        pool,
        trailers: createTrailerClient({ baseUrl: 'https://tenrai.test/v1' }),
        dryRun: true,
        delayMs: 0,
        log: () => {},
      },
    );

    expect(fetchMock).toHaveFetched(
      `https://tenrai.test/v1/anime/${malId}/full`,
    );
    expect(summary).toEqual({
      lookedUp: 1,
      found: 1,
      none: 0,
      failed: 0,
      written: 0,
    });
    const stored = await pool.query(
      `select mal_trailer_youtube_id from title_mal where source_slug = $1`,
      [slug],
    );
    expect(stored.rows).toEqual([{ mal_trailer_youtube_id: null }]);
  });
});
