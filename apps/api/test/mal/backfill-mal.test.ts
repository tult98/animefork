import { randomInt } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backfillMal,
  findBackfillRows,
  findRecheckRows,
  openPool,
  recheckMal,
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

  it('replaces a stored match that fails the year guard on --recheck --write, and keeps a passing one the rerun disagrees with', async () => {
    const run = randomInt(1_000_000_000);
    const hyouken = `hyouken-no-majutsushi-ga-sekai-wo-suberu-ii-a${run}`;
    const tienNghich = `tien-nghich-a${run}`;
    const firstSeason = randomInt(1, 1_000_000_000);
    const secondSeason = firstSeason + 1;
    const storedId = randomInt(1, 1_000_000_000);
    const rerunId = storedId + 1;
    await pool.query(
      `insert into title_art (source_slug, status, reason, matcher_version, source_name, source_year, source_episode_count)
       values ($1, 'no_match', 'no candidate', 1, 'Phù Thủy Băng Kiếm Sẽ Thống Trị Thế Giới 2', 2026, 12),
              ($2, 'no_match', 'no candidate', 1, 'Tiên Nghịch', 2023, null)`,
      [hyouken, tienNghich],
    );
    await pool.query(
      `insert into title_mal (source_slug, status, mal_id, mal_start_date, mal_start_year, mal_start_season,
                              mal_media_type, matched_title, matched_by, matcher_version, attempted_at, fetched_at)
       values ($1, 'ok', $2, '2023-01-06', 2023, 'winter', 'tv', 'Hyouken no Majutsushi ga Sekai wo Suberu', 'score', 8, $5, $5),
              ($3, 'ok', $4, '2023-09-24', 2023, 'fall', 'ona', 'Xian Ni', 'jev', 8, $5, $5)`,
      [
        hyouken,
        firstSeason,
        tienNghich,
        storedId,
        new Date('2026-02-01T00:00:00Z'),
      ],
    );
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=hyouken+', {
        data: [
          {
            node: {
              id: firstSeason,
              title: 'Hyouken no Majutsushi ga Sekai wo Suberu',
              start_season: { year: 2023, season: 'winter' },
              num_episodes: 12,
              media_type: 'tv',
            },
          },
          {
            node: {
              id: secondSeason,
              title: 'Hyouken no Majutsushi ga Sekai wo Suberu II',
              start_season: { year: 2026, season: 'winter' },
              num_episodes: 12,
              media_type: 'tv',
            },
          },
        ],
      })
      .get('begin:https://mal.test/v2/anime?q=tien+nghich&', {
        data: [
          {
            node: {
              id: rerunId,
              title: 'Tien Nghich',
              start_season: { year: 2023, season: 'fall' },
              media_type: 'ona',
            },
          },
        ],
      })
      .get('begin:https://mal.test/v2/anime?q=', { data: [] });
    const store = new PostgresMalStore(pool);
    const lines: string[] = [];

    const summary = await recheckMal(
      await findRecheckRows(pool, null, [hyouken, tienNghich]),
      {
        filler: new MalFiller(
          store,
          createMalClient({
            clientId: 'abc',
            baseUrl: 'https://mal.test/v2',
            gapMs: 0,
          }),
          () => new Date('2026-03-01T00:00:00Z'),
        ),
        store,
        pool,
        write: true,
        log: (line) => lines.push(line),
      },
    );

    expect(summary).toEqual({
      rechecked: 2,
      filled: 0,
      replaced: 1,
      kept: 0,
      differs: 1,
      failed: 0,
      tieBreaks: 0,
    });
    expect(lines).toEqual([
      `${hyouken} replaced ${firstSeason} Hyouken no Majutsushi ga Sekai wo Suberu (fails: year 2026 vs 2023; season 2 vs 1) ` +
        `with ${secondSeason} Hyouken no Majutsushi ga Sekai wo Suberu II by score`,
      `${tienNghich} differs: keeps ${storedId} Xian Ni, rerun ${rerunId} Tien Nghich by score`,
    ]);
    const stored = await pool.query(
      `select source_slug, status, mal_id, matched_title, matched_by
         from title_mal where source_slug = any($1) order by source_slug`,
      [[hyouken, tienNghich]],
    );
    expect(stored.rows).toEqual([
      {
        source_slug: hyouken,
        status: 'ok',
        mal_id: secondSeason,
        matched_title: 'Hyouken no Majutsushi ga Sekai wo Suberu II',
        matched_by: 'score',
      },
      {
        source_slug: tienNghich,
        status: 'ok',
        mal_id: storedId,
        matched_title: 'Xian Ni',
        matched_by: 'jev',
      },
    ]);
  });

  it('a season-2 slug stored on the season-1 entry is replaced by its season-2 entry on --recheck --write', async () => {
    const run = randomInt(1_000_000_000);
    const slug = `katainaka-no-ossan-kensei-ni-naru-ii-a${run}`;
    const firstSeason = randomInt(1, 1_000_000_000);
    const secondSeason = firstSeason + 1;
    await pool.query(
      `insert into title_art (source_slug, status, reason, matcher_version, source_name, source_year, source_episode_count)
       values ($1, 'no_match', 'no candidate', 1, 'Katainaka no Ossan, Kensei ni Naru II', 2026, 12)`,
      [slug],
    );
    await pool.query(
      `insert into title_mal (source_slug, status, mal_id, mal_start_date, mal_start_year, mal_start_season,
                              mal_media_type, matched_title, matched_by, matcher_version, attempted_at, fetched_at)
       values ($1, 'ok', $2, '2025-04-05', 2025, 'spring', 'tv', 'Katainaka no Ossan, Kensei ni Naru', 'score', 8, $3, $3)`,
      [slug, firstSeason, new Date('2026-02-01T00:00:00Z')],
    );
    fetchMock.get('begin:https://mal.test/v2/anime?q=', {
      data: [
        {
          node: {
            id: firstSeason,
            title: 'Katainaka no Ossan, Kensei ni Naru',
            start_season: { year: 2025, season: 'spring' },
            num_episodes: 13,
            media_type: 'tv',
          },
        },
        {
          node: {
            id: secondSeason,
            title: 'Katainaka no Ossan, Kensei ni Naru II',
            start_season: { year: 2026, season: 'winter' },
            num_episodes: 12,
            media_type: 'tv',
          },
        },
      ],
    });
    const store = new PostgresMalStore(pool);
    const lines: string[] = [];

    const summary = await recheckMal(
      await findRecheckRows(pool, null, [slug]),
      {
        filler: new MalFiller(
          store,
          createMalClient({
            clientId: 'abc',
            baseUrl: 'https://mal.test/v2',
            gapMs: 0,
          }),
          () => new Date('2026-03-01T00:00:00Z'),
        ),
        store,
        pool,
        write: true,
        log: (line) => lines.push(line),
      },
    );

    expect(summary).toMatchObject({ replaced: 1, differs: 0, failed: 0 });
    expect(lines).toEqual([
      `${slug} replaced ${firstSeason} Katainaka no Ossan, Kensei ni Naru (fails: season 2 vs 1) ` +
        `with ${secondSeason} Katainaka no Ossan, Kensei ni Naru II by score`,
    ]);
    const stored = await pool.query(
      'select status, mal_id, matched_title from title_mal where source_slug = $1',
      [slug],
    );
    expect(stored.rows).toEqual([
      {
        status: 'ok',
        mal_id: secondSeason,
        matched_title: 'Katainaka no Ossan, Kensei ni Naru II',
      },
    ]);
  });

  it('reports what --recheck would change without writing anything when --write is left out', async () => {
    const run = randomInt(1_000_000_000);
    const hyouken = `hyouken-no-majutsushi-ga-sekai-wo-suberu-ii-a${run}`;
    const shirobako = `shirobako-a${run}`;
    const firstSeason = randomInt(1, 1_000_000_000);
    const secondSeason = firstSeason + 1;
    const shirobakoId = randomInt(1, 2_000_000_000);
    await pool.query(
      `insert into title_art (source_slug, status, reason, matcher_version, source_name, source_year, source_episode_count)
       values ($1, 'no_match', 'no candidate', 1, 'Phù Thủy Băng Kiếm Sẽ Thống Trị Thế Giới 2', 2026, 12),
              ($2, 'no_match', 'no candidate', 1, 'Shirobako', 2014, null)`,
      [hyouken, shirobako],
    );
    await pool.query(
      `insert into title_mal (source_slug, status, mal_id, mal_start_date, mal_start_year, mal_start_season,
                              mal_media_type, matched_title, matched_by, matcher_version, attempted_at, fetched_at)
       values ($1, 'ok', $2, '2023-01-06', 2023, 'winter', 'tv', 'Hyouken no Majutsushi ga Sekai wo Suberu', 'score', 8, $3, $3)`,
      [hyouken, firstSeason, new Date('2026-02-01T00:00:00Z')],
    );
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=hyouken+', {
        data: [
          {
            node: {
              id: secondSeason,
              title: 'Hyouken no Majutsushi ga Sekai wo Suberu II',
              start_season: { year: 2026, season: 'winter' },
              num_episodes: 12,
              media_type: 'tv',
            },
          },
        ],
      })
      .get('begin:https://mal.test/v2/anime?q=Shirobako&', {
        data: [
          {
            node: {
              id: shirobakoId,
              title: 'Shirobako',
              start_season: { year: 2014, season: 'fall' },
              media_type: 'tv',
            },
          },
        ],
      });
    const readOnly = openPool(TEST_DATABASE_URL, true);
    const store = new PostgresMalStore(readOnly);
    const lines: string[] = [];

    const summary = await recheckMal(
      await findRecheckRows(readOnly, null, [hyouken, shirobako]),
      {
        filler: new MalFiller(
          store,
          createMalClient({
            clientId: 'abc',
            baseUrl: 'https://mal.test/v2',
            gapMs: 0,
          }),
          () => new Date('2026-03-01T00:00:00Z'),
        ),
        store,
        pool: readOnly,
        write: false,
        log: (line) => lines.push(line),
      },
    ).finally(() => readOnly.end());

    expect(summary).toMatchObject({ filled: 1, replaced: 1, failed: 0 });
    expect(lines).toEqual([
      `${hyouken} replaced ${firstSeason} Hyouken no Majutsushi ga Sekai wo Suberu (fails: year 2026 vs 2023; season 2 vs 1) ` +
        `with ${secondSeason} Hyouken no Majutsushi ga Sekai wo Suberu II by score`,
      `${shirobako} filled ${shirobakoId} Shirobako by score`,
    ]);
    const stored = await pool.query(
      `select source_slug, status, mal_id from title_mal where source_slug = any($1)`,
      [[hyouken, shirobako]],
    );
    expect(stored.rows).toEqual([
      { source_slug: hyouken, status: 'ok', mal_id: firstSeason },
    ]);
  });
});
