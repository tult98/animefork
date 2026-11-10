import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresArtStore } from '../../src/art/art.store.ts';
import { MATCHER_VERSION } from '../../src/art/retry.ts';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../../src/database/migration-runner.ts';

const url = process.env.DATABASE_URL;
const prefix = `test-${process.pid}-${Date.now()}`;
const slug = (name: string) => `${prefix}-${name}`;

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
    backdrop_path: backdrop,
    backdrop_lang: 'en',
    poster_path: `/poster${backdrop}`,
    poster_lang: 'vi',
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

  it('keeps the first matched write and ignores later misses and matches', async () => {
    const s = slug('first-wins');
    await store.saveMatched({ title: title(s, '/first.jpg'), episodes: [] });
    await store.saveMiss(s, 'failed', 'late');
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
      [s, MATCHER_VERSION - 1],
    );
    await store.saveMiss(s, 'failed', 'late');
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

  it('replaces a miss with a later miss or match', async () => {
    const s = slug('retry');
    await store.saveMiss(s, 'failed', 'timeout');
    await store.saveMiss(s, 'no_match', 'no TMDB search results');
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
