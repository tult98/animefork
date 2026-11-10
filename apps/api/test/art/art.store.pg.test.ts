import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresArtStore } from '../../src/art/art.store.ts';
import { MATCHED_REFRESH_BELOW, MATCHER_VERSION } from '../../src/art/retry.ts';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../../src/database/migration-runner.ts';

const url = process.env.DATABASE_URL;
const prefix = `test-${process.pid}-${Date.now()}`;
const slug = (name: string) => `${prefix}-${name}`;
const source = (s: string) => ({ slug: s, name: 'Source Name' });

describe.skipIf(!url)('PostgresArtStore against DATABASE_URL', () => {
  let pool: pg.Pool;
  let store: PostgresArtStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await new MigrationRunner(pool, DEFAULT_MIGRATIONS_DIR).run();
    store = new PostgresArtStore(pool);
  });

  afterAll(async () => {
    await pool.query(`delete from title_art where source_slug like $1`, [
      `${prefix}-%`,
    ]);
    await pool.end();
  });

  const title = (s: string, backdrop: string) => ({
    source_slug: s,
    tmdb_id: 100,
    tmdb_season: 1,
    match_scope: 'season' as const,
    backdrop_path: backdrop,
    backdrop_lang: 'en',
    poster_path: `/poster${backdrop}`,
    poster_lang: 'vi',
    source_name: 'Source Name',
    source_year: null,
    source_episode_count: null,
    matched_by: 'baseline' as const,
  });

  it('stores a matched title with its stills in one write', async () => {
    const s = slug('matched');
    await store.saveMatched({
      title: title(s, '/b.jpg'),
      episodes: [
        { source_slug: s, episode_number: 1, still_path: '/e1.jpg' },
        { source_slug: s, episode_number: 3, still_path: '/e3.jpg' },
      ],
    });
    const row = (await store.find([s, slug('absent')])).get(s);
    expect(row).toMatchObject({
      status: 'matched',
      tmdbId: 100,
      tmdbSeason: 1,
      backdropPath: '/b.jpg',
      posterPath: '/poster/b.jpg',
      posterLang: 'vi',
      matcherVersion: MATCHER_VERSION,
    });
    expect(row?.attemptedAt).toBeInstanceOf(Date);
    expect([...(await store.episodes(s))]).toEqual([
      [1, '/e1.jpg'],
      [3, '/e3.jpg'],
    ]);
  });

  it('round-trips a show-scope row with a null season and no stills', async () => {
    const s = slug('show-scope');
    await store.saveMatched({
      title: {
        ...title(s, '/show.jpg'),
        tmdb_season: null,
        match_scope: 'show' as const,
        matched_by: 'jev',
      },
      episodes: [],
    });
    expect((await store.find([s])).get(s)).toMatchObject({
      status: 'matched',
      tmdbId: 100,
      tmdbSeason: null,
      matchScope: 'show',
      backdropPath: '/show.jpg',
      matchedBy: 'jev',
    });
    expect((await store.episodes(s)).size).toBe(0);
  });

  it('reads a season row as season scope and a row from before the column too', async () => {
    const written = slug('season-scope');
    const legacy = slug('legacy');
    await store.saveMatched({ title: title(written, '/b.jpg'), episodes: [] });
    await pool.query(
      `insert into title_art (source_slug, status, tmdb_id, tmdb_season, matcher_version)
       values ($1, 'matched', 100, 2, 3)`,
      [legacy],
    );
    const rows = await store.find([written, legacy]);
    expect(rows.get(written)).toMatchObject({
      matchScope: 'season',
      tmdbSeason: 1,
    });
    expect(rows.get(legacy)).toMatchObject({
      matchScope: 'season',
      tmdbSeason: 2,
    });
  });

  it('replaces a miss with a show-scope match', async () => {
    const s = slug('miss-to-show');
    await store.saveMiss(source(s), 'no_match', 'rejected');
    await store.saveMatched({
      title: {
        ...title(s, '/b.jpg'),
        tmdb_season: null,
        match_scope: 'show' as const,
      },
      episodes: [],
    });
    expect((await store.find([s])).get(s)).toMatchObject({
      status: 'matched',
      matchScope: 'show',
      tmdbSeason: null,
      reason: null,
    });
  });

  it('refuses a season-scope matched row without a season, but not a show one', async () => {
    const insert = (s: string, scope: string) =>
      pool.query(
        `insert into title_art (source_slug, status, tmdb_id, match_scope, matcher_version)
         values ($1, 'matched', 100, $2, 4)`,
        [s, scope],
      );
    await expect(insert(slug('no-season'), 'season')).rejects.toThrow(
      /title_art_matched_has_tmdb/,
    );
    await expect(insert(slug('show-ok'), 'show')).resolves.toBeDefined();
    await expect(insert(slug('bad-scope'), 'galaxy')).rejects.toThrow(
      /check constraint/,
    );
  });

  it('keeps the first matched write and ignores later misses and matches', async () => {
    const s = slug('first-wins');
    await store.saveMatched({ title: title(s, '/first.jpg'), episodes: [] });
    await store.saveMiss(source(s), 'failed', 'late');
    await store.saveMatched({
      title: title(s, '/second.jpg'),
      episodes: [{ source_slug: s, episode_number: 1, still_path: '/x.jpg' }],
    });
    expect((await store.find([s])).get(s)).toMatchObject({
      status: 'matched',
      backdropPath: '/first.jpg',
      reason: null,
    });
    expect((await store.episodes(s)).size).toBe(0);
  });

  it('overwrites a matched row of an older matcher version once', async () => {
    const s = slug('stale');
    await pool.query(
      `insert into title_art (source_slug, status, tmdb_id, tmdb_season, backdrop_path, matcher_version)
       values ($1, 'matched', 100, 1, '/old.jpg', $2)`,
      [s, MATCHED_REFRESH_BELOW - 1],
    );
    await store.saveMiss(source(s), 'failed', 'late');
    expect((await store.find([s])).get(s)).toMatchObject({
      status: 'matched',
      backdropPath: '/old.jpg',
      posterPath: null,
    });
    await store.saveMatched({ title: title(s, '/new.jpg'), episodes: [] });
    await store.saveMatched({ title: title(s, '/newer.jpg'), episodes: [] });
    expect((await store.find([s])).get(s)).toMatchObject({
      backdropPath: '/new.jpg',
      posterPath: '/poster/new.jpg',
      matcherVersion: MATCHER_VERSION,
    });
  });

  it('keeps a matched row written at the refresh version', async () => {
    const s = slug('current-enough');
    await pool.query(
      `insert into title_art (source_slug, status, tmdb_id, tmdb_season, backdrop_path, matcher_version)
       values ($1, 'matched', 100, 1, '/kept.jpg', $2)`,
      [s, MATCHED_REFRESH_BELOW],
    );
    await store.saveMatched({ title: title(s, '/new.jpg'), episodes: [] });
    expect((await store.find([s])).get(s)).toMatchObject({
      backdropPath: '/kept.jpg',
      matcherVersion: MATCHED_REFRESH_BELOW,
    });
  });

  it('round-trips the source inputs and who matched', async () => {
    const hit = slug('provenance-hit');
    const miss = slug('provenance-miss');
    await store.saveMatched({
      title: {
        ...title(hit, '/b.jpg'),
        source_name: 'Thám Tử Lừng Danh Conan',
        source_year: 1996,
        source_episode_count: 1100,
        matched_by: 'jev',
      },
      episodes: [],
    });
    await store.saveMiss(
      { slug: miss, name: 'Không Có', year: 2024, episodeCount: 12 },
      'failed',
      'jev down',
    );
    await store.saveMiss({ slug: miss, name: 'Không Có' }, 'no_match', 'none');
    const rows = await store.find([hit, miss]);
    expect(rows.get(hit)).toMatchObject({
      sourceName: 'Thám Tử Lừng Danh Conan',
      sourceYear: 1996,
      sourceEpisodeCount: 1100,
      matchedBy: 'jev',
    });
    expect(rows.get(miss)).toMatchObject({
      status: 'no_match',
      sourceName: 'Không Có',
      sourceYear: null,
      sourceEpisodeCount: null,
      matchedBy: null,
    });
  });

  it('refuses an unknown matched_by', async () => {
    await expect(
      pool.query(
        `insert into title_art (source_slug, status, matcher_version, matched_by) values ($1, 'no_match', 3, 'oracle')`,
        [slug('bad-by')],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('replaces a miss with a later miss or match', async () => {
    const s = slug('retry');
    await store.saveMiss(source(s), 'failed', 'timeout');
    await store.saveMiss(source(s), 'no_match', 'no TMDB search results');
    expect((await store.find([s])).get(s)).toMatchObject({
      status: 'no_match',
      reason: 'no TMDB search results',
      tmdbId: null,
    });
    await store.saveMatched({ title: title(s, '/b.jpg'), episodes: [] });
    expect((await store.find([s])).get(s)).toMatchObject({
      status: 'matched',
      reason: null,
    });
  });

  it('refuses a matched row without a TMDB id', async () => {
    await expect(
      pool.query(
        `insert into title_art (source_slug, status, matcher_version) values ($1, 'matched', 1)`,
        [slug('bad')],
      ),
    ).rejects.toThrow(/title_art_matched_has_tmdb/);
  });
});
