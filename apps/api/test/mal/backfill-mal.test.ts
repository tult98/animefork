import { randomInt } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backfillMal,
  findBackfillRows,
} from '../../src/scripts/backfill-mal.ts';
import { createMalClient } from '../../src/mal/mal.client.ts';
import { MalFiller } from '../../src/mal/mal.filler.ts';
import { PostgresMalStore } from '../../src/mal/mal.store.ts';
import { createTrailerClient } from '../../src/mal/trailer.client.ts';
import { TEST_DATABASE_URL } from '../test-database.ts';

describe('backfill-mal', () => {
  let pool: pg.Pool;
  beforeEach(() => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  });
  afterEach(async () => {
    await pool.end();
  });

  it('matches an old miss and keeps a title MAL has no entry for a miss under the current matcher', async () => {
    const run = randomInt(1_000_000_000);
    const malId = randomInt(1, 2_000_000_000);
    const attemptedAt = new Date('2026-02-01T00:00:00Z');
    const rows = [
      {
        source_slug: `tien-nghich-a${run}`,
        source_name: 'Tiên Nghịch',
        source_year: 2023,
        source_episode_count: null,
        other_names: null,
        names_at: null,
        taken_mal_ids: [],
        attempted_at: attemptedAt,
      },
      {
        source_slug: `nobody-knows-a${run}`,
        source_name: 'Nobody Knows',
        source_year: null,
        source_episode_count: null,
        other_names: null,
        names_at: null,
        taken_mal_ids: [],
        attempted_at: attemptedAt,
      },
    ];
    await pool.query(
      `insert into title_mal (source_slug, status, reason, matcher_version, attempted_at)
       select slug, 'none', 'no candidate cleared the match', 1, $2
         from unnest($1::text[]) as t(slug)`,
      [rows.map((r) => r.source_slug), attemptedAt],
    );
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Ti%C3%AAn+Ngh%E1%BB%8Bch&', {
        data: [],
      })
      .get('begin:https://mal.test/v2/anime?q=tien+nghich&', {
        data: [
          {
            node: {
              id: malId,
              title: 'Tien Nghich',
              start_season: { year: 2023, season: 'fall' },
              media_type: 'ona',
            },
          },
        ],
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, {
        data: { trailer: { youtube_id: null } },
      })
      .get('begin:https://mal.test/v2/anime?q=Nobody+Knows&', { data: [] })
      .get('begin:https://mal.test/v2/anime?q=nobody+knows&', { data: [] });
    const store = new PostgresMalStore(pool);
    const lines: string[] = [];

    const summary = await backfillMal(rows, {
      filler: new MalFiller(
        store,
        createMalClient({
          clientId: 'abc',
          baseUrl: 'https://mal.test/v2',
          gapMs: 0,
        }),
        () => new Date('2026-03-01T00:00:00Z'),
        null,
        null,
        createTrailerClient({ baseUrl: 'https://tenrai.test/v1' }),
      ),
      store,
      log: (line) => lines.push(line),
    });

    expect(summary).toEqual({
      lookedUp: 2,
      ok: 1,
      none: 1,
      failed: 0,
      settled: 0,
    });
    expect(lines).toEqual([
      `tien-nghich-a${run} ok ${malId} Tien Nghich by score`,
      `nobody-knows-a${run} none no candidate cleared the match`,
    ]);
    const stored = await pool.query(
      `select source_slug, status, mal_id, matcher_version, attempted_at
         from title_mal where source_slug = any($1) order by source_slug`,
      [rows.map((r) => r.source_slug)],
    );
    const at = new Date('2026-03-01T00:00:00Z');
    expect(stored.rows).toEqual([
      {
        source_slug: `nobody-knows-a${run}`,
        status: 'none',
        mal_id: null,
        matcher_version: 8,
        attempted_at: at,
      },
      {
        source_slug: `tien-nghich-a${run}`,
        status: 'ok',
        mal_id: malId,
        matcher_version: 8,
        attempted_at: at,
      },
    ]);
    expect(fetchMock).toHaveFetched('begin:https://mal.test/v2/anime', {
      query: { q: 'tien nghich', nsfw: 'true' },
    });
  });

  it('looks up a title that has art but was never looked up on MAL', async () => {
    const slug = `shirobako-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await pool.query(
      `insert into title_art (source_slug, status, reason, matcher_version, source_name, source_year)
       values ($1, 'no_match', 'no candidate', 1, 'Shirobako', 2014)`,
      [slug],
    );
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Shirobako&', {
        data: [
          {
            node: {
              id: malId,
              title: 'Shirobako',
              start_season: { year: 2014, season: 'fall' },
              media_type: 'tv',
            },
          },
        ],
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, {
        data: { trailer: null },
      });
    const store = new PostgresMalStore(pool);
    const lines: string[] = [];

    const rows = (await findBackfillRows(pool, null)).filter(
      (row) => row.source_slug === slug,
    );
    const summary = await backfillMal(rows, {
      filler: new MalFiller(
        store,
        createMalClient({
          clientId: 'abc',
          baseUrl: 'https://mal.test/v2',
          gapMs: 0,
        }),
        () => new Date('2026-03-01T00:00:00Z'),
        null,
        null,
        createTrailerClient({ baseUrl: 'https://tenrai.test/v1' }),
      ),
      store,
      log: (line) => lines.push(line),
    });

    expect(rows).toEqual([
      {
        source_slug: slug,
        attempted_at: null,
        source_name: 'Shirobako',
        source_year: 2014,
        source_episode_count: null,
        other_names: null,
        names_at: null,
        taken_mal_ids: [],
      },
    ]);
    expect(summary).toEqual({
      lookedUp: 1,
      ok: 1,
      none: 0,
      failed: 0,
      settled: 0,
    });
    expect(lines).toEqual([`${slug} ok ${malId} Shirobako by score`]);
    const stored = await pool.query(
      'select status, mal_id from title_mal where source_slug = $1',
      [slug],
    );
    expect(stored.rows).toEqual([{ status: 'ok', mal_id: malId }]);
  });
});
