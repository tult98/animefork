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

  it('keeps a translated overview across a refill that reads the same English text', async () => {
    const s = slug('tmdb-info');
    const info = (overview: string) => [
      {
        source_slug: s,
        episode_number: 1,
        name: 'Fateful Meeting',
        overview,
        overview_lang: 'en' as const,
      },
    ];
    await store.saveMatched({
      title: title(s, '/b.jpg'),
      episodes: [],
      info: info('Nasa meets Tsukasa.'),
    });
    await store.saveEpisodeTranslation(s, 1, 'Nasa gặp Tsukasa.');
    await pool.query(
      `update title_art set matcher_version = 0 where source_slug = $1`,
      [s],
    );

    await store.saveMatched({
      title: title(s, '/b.jpg'),
      episodes: [],
      info: info('Nasa meets Tsukasa.'),
    });
    expect((await store.tmdbEpisodes(s)).get(1)?.overviewVi).toBe(
      'Nasa gặp Tsukasa.',
    );

    await pool.query(
      `update title_art set matcher_version = 0 where source_slug = $1`,
      [s],
    );
    await store.saveMatched({
      title: title(s, '/b.jpg'),
      episodes: [],
      info: info('Changed text.'),
    });
    expect((await store.tmdbEpisodes(s)).get(1)).toMatchObject({
      overview: 'Changed text.',
      overviewVi: null,
    });
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

  it('reads a matched row without an overview attempt as all nulls', async () => {
    const s = slug('overview-unset');
    await store.saveMatched({ title: title(s, '/b.jpg'), episodes: [] });
    expect((await store.find([s])).get(s)).toMatchObject({
      overview: null,
      overviewLang: null,
      overviewTranslated: false,
      overviewStatus: null,
      overviewAttemptedAt: null,
    });
  });

  it('round-trips a Vietnamese and a translated overview and keeps ok final', async () => {
    const vi = slug('overview-vi');
    const en = slug('overview-en');
    await store.saveMatched({ title: title(vi, '/b.jpg'), episodes: [] });
    await store.saveMatched({ title: title(en, '/b.jpg'), episodes: [] });
    await store.saveOverview(vi, 100, {
      status: 'ok',
      text: 'Tóm tắt tiếng Việt.',
      lang: 'vi',
      translated: false,
    });
    await store.saveOverview(en, 100, {
      status: 'ok',
      text: 'Bản dịch.',
      lang: 'en',
      translated: true,
    });
    await store.saveOverview(vi, 100, { status: 'failed' });
    const rows = await store.find([vi, en]);
    expect(rows.get(vi)).toMatchObject({
      overview: 'Tóm tắt tiếng Việt.',
      overviewLang: 'vi',
      overviewTranslated: false,
      overviewStatus: 'ok',
    });
    expect(rows.get(vi)?.overviewAttemptedAt).toBeInstanceOf(Date);
    expect(rows.get(en)).toMatchObject({
      overview: 'Bản dịch.',
      overviewLang: 'en',
      overviewTranslated: true,
      overviewStatus: 'ok',
    });
  });

  it('replaces a none or failed overview, and ignores misses and other TMDB ids', async () => {
    const s = slug('overview-retry');
    const miss = slug('overview-miss');
    await store.saveMatched({ title: title(s, '/b.jpg'), episodes: [] });
    await store.saveMiss(source(miss), 'no_match', 'none');
    await store.saveOverview(s, 100, { status: 'failed' });
    expect((await store.find([s])).get(s)?.overviewStatus).toBe('failed');
    await store.saveOverview(s, 100, { status: 'none' });
    expect((await store.find([s])).get(s)).toMatchObject({
      overviewStatus: 'none',
      overview: null,
    });
    await store.saveOverview(s, 999, {
      status: 'ok',
      text: 'Sai phim.',
      lang: 'vi',
      translated: false,
    });
    await store.saveOverview(miss, 100, {
      status: 'ok',
      text: 'Không khớp.',
      lang: 'vi',
      translated: false,
    });
    const rows = await store.find([s, miss]);
    expect(rows.get(s)?.overviewStatus).toBe('none');
    expect(rows.get(miss)?.overviewStatus).toBeNull();
  });

  it('drops the overview when a stale refill matches a different TMDB id', async () => {
    const same = slug('overview-same-id');
    const other = slug('overview-other-id');
    for (const s of [same, other]) {
      await pool.query(
        `insert into title_art (source_slug, status, tmdb_id, tmdb_season, matcher_version,
            overview, overview_lang, overview_status, overview_attempted_at)
         values ($1, 'matched', 100, 1, $2, 'Cũ.', 'vi', 'ok', now())`,
        [s, MATCHED_REFRESH_BELOW - 1],
      );
    }
    await store.saveMatched({ title: title(same, '/new.jpg'), episodes: [] });
    await store.saveMatched({
      title: { ...title(other, '/new.jpg'), tmdb_id: 200 },
      episodes: [],
    });
    const rows = await store.find([same, other]);
    expect(rows.get(same)).toMatchObject({
      tmdbId: 100,
      overview: 'Cũ.',
      overviewStatus: 'ok',
    });
    expect(rows.get(other)).toMatchObject({
      tmdbId: 200,
      overview: null,
      overviewLang: null,
      overviewTranslated: false,
      overviewStatus: null,
      overviewAttemptedAt: null,
    });
  });

  it('refuses an ok overview that is missing, untranslated English or an unknown status', async () => {
    const insert = (s: string, columns: string, values: string) =>
      pool.query(
        `insert into title_art (source_slug, status, tmdb_id, tmdb_season, matcher_version, ${columns})
         values ($1, 'matched', 100, 1, 4, ${values})`,
        [s],
      );
    await expect(
      insert(slug('ok-empty'), 'overview_status', `'ok'`),
    ).rejects.toThrow(/title_art_overview_ok/);
    await expect(
      insert(
        slug('ok-raw-en'),
        'overview, overview_lang, overview_status',
        `'Raw English.', 'en', 'ok'`,
      ),
    ).rejects.toThrow(/title_art_overview_ok/);
    await expect(
      insert(slug('bad-status'), 'overview_status', `'maybe'`),
    ).rejects.toThrow(/check constraint/);
    await expect(
      insert(slug('bad-lang'), 'overview_lang', `'ja'`),
    ).rejects.toThrow(/check constraint/);
  });

  it('refuses a matched row without a TMDB id', async () => {
    await expect(
      pool.query(
        `insert into title_art (source_slug, status, matcher_version) values ($1, 'matched', 1)`,
        [slug('bad')],
      ),
    ).rejects.toThrow(/title_art_matched_has_tmdb/);
  });

  it('writes episode text without touching the title and keeps the sync status per slug', async () => {
    const s = slug('backfill');
    await store.saveMatched({ title: title(s, '/b.jpg'), episodes: [] });

    await store.saveEpisodeInfo(s, [
      {
        source_slug: s,
        episode_number: 1,
        name: 'One',
        overview: 'First.',
        overview_lang: 'en',
      },
    ]);
    await store.saveEpisodeInfoSync(s, 'failed');
    await store.saveEpisodeInfoSync(s, 'ok');

    expect((await store.tmdbEpisodes(s)).get(1)).toMatchObject({
      name: 'One',
      overviewVi: null,
    });
    expect((await store.episodeInfoSync([s])).get(s)?.status).toBe('ok');
    expect((await store.find([s])).get(s)?.backdropPath).toBe('/b.jpg');
  });
});
