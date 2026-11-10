import { describe, expect, it } from 'vitest';
import { BaselineMatcher } from '../src/matcher.ts';
import { mapEpisodes, syncTitle, type SyncOutcome } from '../src/sync.ts';
import type { TitleInput } from '../src/contract.ts';
import { createTmdbClient } from '../src/tmdb.ts';
import * as fx from './fixtures.ts';
import { mockTmdb } from './tmdb-mock.ts';

function sync(input: TitleInput, tmdbFetch: typeof fetch = mockTmdb()) {
  return syncTitle(input, {
    tmdb: createTmdbClient({ apiKey: 'key', fetch: tmdbFetch }),
    matcher: new BaselineMatcher(),
  });
}

function matched(outcome: SyncOutcome) {
  if (outcome.kind !== 'matched') {
    throw new Error(`expected a match, got ${outcome.skipped.reason}`);
  }
  return outcome.matched;
}

describe('mapEpisodes', () => {
  const episodes = [
    { episode_number: 1, still_path: '/a.jpg' },
    { episode_number: 2, still_path: null },
    { episode_number: 3, still_path: '/c.jpg' },
  ];

  it('writes no row for an episode without a still', () => {
    expect(mapEpisodes('s', episodes, 0).map((r) => r.episode_number)).toEqual([
      1, 3,
    ]);
  });

  it('shifts numbers by the offset and drops those outside the source range', () => {
    expect(
      mapEpisodes('s', episodes, 12, 14).map((r) => r.episode_number),
    ).toEqual([13]);
  });
});

describe('createTmdbClient', () => {
  it('validates response shapes', async () => {
    const client = createTmdbClient({
      apiKey: 'key',
      fetch: async () => Response.json({ results: [{ id: 'x' }] }),
    });
    await expect(client.searchTv('a')).rejects.toThrow();
  });

  it('uses a custom base URL when one is given', async () => {
    let seen = '';
    const client = createTmdbClient({
      apiKey: 'key',
      baseUrl: 'https://api.tmdb.org/3/',
      fetch: async (input) => {
        seen = String(input);
        return Response.json({ results: [] });
      },
    });
    await client.searchTv('a');
    expect(seen.startsWith('https://api.tmdb.org/3/search/tv?')).toBe(true);
  });

  it('requests images in vi, en and textless', async () => {
    let seen = '';
    const client = createTmdbClient({
      apiKey: 'key',
      fetch: async (input) => {
        seen = String(input);
        return Response.json({ backdrops: [] });
      },
    });
    await client.tvImages(5);
    expect(new URL(seen).searchParams.get('include_image_language')).toBe(
      'vi,en,null',
    );
  });
});

describe('syncTitle against a mocked TMDB', () => {
  it('matches a title with its backdrop and stills', async () => {
    const outcome = matched(
      await sync({
        slug: 'tonikaku-kawaii-a3860',
        name: 'Tonikaku Kawaii',
        year: 2020,
        episodeCount: 12,
      }),
    );
    expect(outcome.tmdbId).toBe(100);
    expect(outcome.probability).toBe(1);
    expect(outcome.title).toEqual({
      source_slug: 'tonikaku-kawaii-a3860',
      tmdb_id: 100,
      tmdb_season: 1,
      backdrop_path: '/en.jpg',
      backdrop_lang: 'en',
    });
    expect(outcome.episodes.map((e) => e.episode_number)).toEqual([1, 3]);
  });

  it('skips a title TMDB has no results for', async () => {
    expect(await sync({ slug: 'nothing-a1', name: 'Nothing Here' })).toEqual({
      kind: 'skipped',
      skipped: { slug: 'nothing-a1', reason: 'no TMDB search results' },
    });
  });

  it('skips a title whose season TMDB does not have', async () => {
    const outcome = await sync({
      slug: 's5',
      name: 'Tonikaku Kawaii',
      seasonName: 'Season 5',
      year: 2020,
    });
    expect(outcome.kind === 'skipped' && outcome.skipped.reason).toMatch(
      /no season 5/,
    );
  });

  it('throws when TMDB fails mid-sync', async () => {
    await expect(
      sync(
        { slug: 'a', name: 'Tonikaku Kawaii', year: 2020 },
        mockTmdb({ '/3/tv/100/images': undefined }),
      ),
    ).rejects.toThrow(/TMDB \/tv\/100\/images answered 404/);
  });
});

describe('season-aware year and alternative titles in a sync', () => {
  const romajiRoutes = {
    '/3/search/tv?Tonikaku Kawaii': fx.SEARCH_ROMAJI,
    '/3/tv/100': {
      ...fx.DETAIL_100,
      name: 'TONIKAWA: Over the Moon for You',
    },
    '/3/tv/100/season/2': fx.SEASON_100_1,
  };

  it('matches a romaji title the TMDB names do not contain', async () => {
    const outcome = matched(
      await sync(
        { slug: 'a', name: 'Tonikaku Kawaii', year: 2020 },
        mockTmdb(romajiRoutes),
      ),
    );
    expect(outcome.tmdbId).toBe(100);
  });

  it('does not penalise a later season by the show first air date', async () => {
    const outcome = matched(
      await sync(
        {
          slug: 'b',
          name: 'Tonikaku Kawaii',
          seasonName: '2nd Season',
          year: 2023,
        },
        mockTmdb(romajiRoutes),
      ),
    );
    expect(outcome.title.tmdb_season).toBe(2);
    expect(Number(outcome.probability.toFixed(3))).toBe(0.94);
  });

  it('treats the year as unknown when a later season has no air date', async () => {
    const detail = {
      ...fx.DETAIL_100,
      name: 'TONIKAWA: Over the Moon for You',
      seasons: [
        { season_number: 1, episode_count: 12, air_date: '2020-10-03' },
        { season_number: 2, episode_count: 12, air_date: null },
      ],
    };
    const outcome = matched(
      await sync(
        {
          slug: 'c',
          name: 'Tonikaku Kawaii',
          seasonName: 'Season 2',
          year: 2023,
        },
        mockTmdb({ ...romajiRoutes, '/3/tv/100': detail }),
      ),
    );
    expect(outcome.title.tmdb_season).toBe(2);
  });
});

describe('season marker in the title name', () => {
  const routes = {
    '/3/tv/100': { ...fx.DETAIL_100, name: 'Tonikaku Kawaii' },
    '/3/tv/100/season/2': fx.SEASON_100_1,
  };

  it.each(['Tonikaku Kawaii 2nd Season', 'Tonikaku Kawaii Mùa 2'])(
    'searches TMDB for the bare name and syncs season 2 from "%s"',
    async (name) => {
      const queries: string[] = [];
      const base = mockTmdb(routes);
      const tmdbFetch: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === '/3/search/tv')
          queries.push(url.searchParams.get('query') ?? '');
        return base(input, init);
      };
      const outcome = matched(await sync({ slug: 'd', name }, tmdbFetch));
      expect(queries).toEqual(['Tonikaku Kawaii']);
      expect(outcome.title.tmdb_season).toBe(2);
    },
  );

  it('lets an explicit seasonName win over the name', async () => {
    const outcome = matched(
      await sync(
        { slug: 'e', name: 'Tonikaku Kawaii Season 3', seasonName: 'Season 2' },
        mockTmdb(routes),
      ),
    );
    expect(outcome.title.tmdb_season).toBe(2);
  });
});
