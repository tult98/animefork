import { describe, expect, it } from 'vitest';
import {
  BaselineMatcher,
  type Matcher,
} from '../../../src/art/tmdb/matcher.ts';
import {
  gatherCandidates,
  mapEpisodes,
  syncTitle,
  tmdbQueries,
  type SyncOutcome,
} from '../../../src/art/tmdb/sync.ts';
import type { TitleInput } from '../../../src/art/contract.ts';
import { createTmdbClient } from '../../../src/art/tmdb/tmdb.ts';
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
        return Response.json({ backdrops: [], posters: [] });
      },
    });
    await client.tvImages(5);
    expect(new URL(seen).searchParams.get('include_image_language')).toBe(
      'vi,en,null',
    );
  });
});

describe('syncTitle against a mocked TMDB', () => {
  it('matches a title with its backdrop, poster and stills', async () => {
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
      match_scope: 'season',
      backdrop_path: '/en.jpg',
      backdrop_lang: 'en',
      poster_path: '/poster-vi.jpg',
      poster_lang: 'vi',
      source_name: 'Tonikaku Kawaii',
      source_year: 2020,
      source_episode_count: 12,
      matched_by: 'baseline',
    });
    expect(outcome.episodes.map((e) => e.episode_number)).toEqual([1, 3]);
  });

  it('skips a title TMDB has no results for', async () => {
    expect(await sync({ slug: 'nothing-a1', name: 'Nothing Here' })).toEqual({
      kind: 'skipped',
      skipped: { slug: 'nothing-a1', reason: 'no TMDB search results' },
    });
  });

  it('retries shorter queries when the first search is empty', async () => {
    const searches: string[] = [];
    const inner = mockTmdb({
      '/3/search/tv?Tonikaku Kawaii: Arc Subtitle-hen': fx.SEARCH_NOTHING,
    });
    const spy: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/3/search/tv') {
        searches.push(url.searchParams.get('query') ?? '');
      }
      return inner(input, init);
    };
    const outcome = await sync(
      {
        slug: 'zzz-qqq-x',
        name: 'Tonikaku Kawaii: Arc Subtitle-hen',
        year: 2020,
        episodeCount: 12,
      },
      spy,
    );
    expect(searches).toEqual([
      'Tonikaku Kawaii: Arc Subtitle-hen',
      'Tonikaku Kawaii',
    ]);
    expect(outcome.kind === 'skipped' && outcome.skipped.reason).toMatch(
      /via query 'Tonikaku Kawaii'$/,
    );
  });

  it('falls back to the slug romaji and stops at the first non-empty query', async () => {
    const searches: string[] = [];
    const inner = mockTmdb({
      '/3/search/tv?tonikaku kawaii wa': fx.SEARCH_TONIKAWA,
    });
    const spy: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/3/search/tv') {
        searches.push(url.searchParams.get('query') ?? '');
      }
      return inner(input, init);
    };
    const outcome = await syncTitle(
      {
        slug: 'tonikaku-kawaii-wa-a77',
        name: 'Nothing Here',
        year: 2020,
        episodeCount: 12,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key', fetch: spy }),
        matcher: {
          match: async () => ({
            choice: null,
            probability: 0,
            by: 'baseline',
            scope: 'season',
          }),
        },
      },
    );
    expect(searches).toEqual(['Nothing Here', 'tonikaku kawaii wa']);
    expect(outcome.kind === 'skipped' && outcome.skipped.reason).toMatch(
      /via query 'tonikaku kawaii wa'$/,
    );
  });

  it('stops at the 3-word slug query when the 6-word one finds nothing', async () => {
    const searches: string[] = [];
    const inner = mockTmdb({
      '/3/search/tv?tonikaku kawaii wa ii na desu': fx.SEARCH_NOTHING,
      '/3/search/tv?tonikaku kawaii wa': fx.SEARCH_TONIKAWA,
    });
    const spy: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/3/search/tv') {
        searches.push(url.searchParams.get('query') ?? '');
      }
      return inner(input, init);
    };
    await sync(
      { slug: 'tonikaku-kawaii-wa-ii-na-desu-zzz-a77', name: 'Nothing Here' },
      spy,
    );
    expect(searches).toEqual([
      'Nothing Here',
      'tonikaku kawaii wa ii na desu',
      'tonikaku kawaii wa',
    ]);
  });

  it('makes no extra search when the first one has results', async () => {
    const searches: string[] = [];
    const inner = mockTmdb();
    const spy: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/3/search/tv') {
        searches.push(url.searchParams.get('query') ?? '');
      }
      return inner(input, init);
    };
    await sync(
      { slug: 'tonikaku-kawaii-a3860', name: 'Tonikaku Kawaii', year: 2020 },
      spy,
    );
    expect(searches).toEqual(['Tonikaku Kawaii']);
  });

  it('searches at most 5 queries and still reports no results', async () => {
    const searches: string[] = [];
    const spy: typeof fetch = async (input) => {
      searches.push(new URL(String(input)).searchParams.get('query') ?? '');
      return Response.json({ results: [] });
    };
    const outcome = await sync(
      { slug: 'a-b-c-d-e-f-a1', name: 'Nothing Here-hen: Sub Story-hen' },
      spy,
    );
    expect(searches).toHaveLength(5);
    expect(searches.at(-1)).toBe('a b c d e f');
    expect(outcome.kind === 'skipped' && outcome.skipped.reason).toBe(
      'no TMDB search results',
    );
  });

  it('asks up to two other names after the name and slug queries, on top of the cap', async () => {
    const searches: string[] = [];
    const spy: typeof fetch = async (input) => {
      searches.push(new URL(String(input)).searchParams.get('query') ?? '');
      return Response.json({ results: [] });
    };
    await sync(
      {
        slug: 'a-b-c-d-e-f-a1',
        name: 'Nothing Here-hen: Sub Story-hen',
        otherNames: [
          'Soul Land Season 2',
          'A B C D E F',
          'Douluo Dalu',
          'Third',
        ],
      },
      spy,
    );
    expect(searches).toHaveLength(7);
    expect(searches.slice(4)).toEqual([
      'a b c d e f',
      'Soul Land',
      'Douluo Dalu',
    ]);
  });

  it('downgrades a baseline match to show scope when TMDB lacks the season', async () => {
    const paths: string[] = [];
    const inner = mockTmdb();
    const spy: typeof fetch = async (input, init) => {
      paths.push(new URL(String(input)).pathname);
      return inner(input, init);
    };
    const outcome = matched(
      await sync(
        {
          slug: 's5',
          name: 'Tonikaku Kawaii',
          seasonName: 'Season 5',
          year: 2020,
        },
        spy,
      ),
    );
    expect(outcome.title).toMatchObject({
      tmdb_id: 100,
      tmdb_season: null,
      match_scope: 'show',
      backdrop_path: '/en.jpg',
      poster_path: '/poster-vi.jpg',
      matched_by: 'baseline',
    });
    expect(outcome.episodes).toEqual([]);
    expect(paths.filter((p) => p.includes('/season/'))).toEqual([]);
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

describe('syncTitle with a show-scope answer', () => {
  const showMatcher: Matcher = {
    match: async () => ({
      choice: 100,
      probability: 0.9,
      by: 'jev',
      scope: 'show',
    }),
  };

  it('stores the backdrop and poster, no episodes, and never asks for a season', async () => {
    const paths: string[] = [];
    const inner = mockTmdb();
    const spy: typeof fetch = async (input, init) => {
      paths.push(new URL(String(input)).pathname);
      return inner(input, init);
    };
    const outcome = matched(
      await syncTitle(
        { slug: 'x', name: 'Tonikaku Kawaii', seasonName: 'Season 2' },
        {
          tmdb: createTmdbClient({ apiKey: 'key', fetch: spy }),
          matcher: showMatcher,
        },
      ),
    );
    expect(outcome.title).toMatchObject({
      tmdb_id: 100,
      tmdb_season: null,
      match_scope: 'show',
      backdrop_path: '/en.jpg',
      poster_path: '/poster-vi.jpg',
      matched_by: 'jev',
    });
    expect(outcome.episodes).toEqual([]);
    expect(paths).toContain('/3/tv/100/images');
    expect(paths.filter((p) => p.includes('/season/'))).toEqual([]);
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

describe('the question built for the matcher', () => {
  const gather = (slug: string, name: string) =>
    gatherCandidates(
      { slug, name },
      createTmdbClient({
        apiKey: 'key',
        fetch: mockTmdb({ '/3/search/tv?Tonikaku Kawaii': fx.SEARCH_ROMAJI }),
      }),
    );

  it('carries the full slug romaji without the id', async () => {
    const gathered = await gather(
      'tonikaku-kawaii-wa-dai-ni-ki-a77',
      'Tonikaku Kawaii',
    );
    expect(gathered?.question.romaji).toBe('tonikaku kawaii wa dai ni ki');
  });

  it('leaves the romaji out when it repeats the display name', async () => {
    const gathered = await gather('tonikaku-kawaii-a3860', 'Tonikaku Kawaii');
    expect(gathered?.question.romaji).toBeUndefined();
  });

  it('carries the other names, and leaves them out when there are none', async () => {
    const gathered = await gatherCandidates(
      {
        slug: 'tonikaku-kawaii-a3860',
        name: 'Tonikaku Kawaii',
        otherNames: ['TONIKAWA: Over the Moon For You'],
      },
      createTmdbClient({ apiKey: 'key', fetch: mockTmdb() }),
    );
    expect(gathered?.question.otherNames).toEqual([
      'TONIKAWA: Over the Moon For You',
    ]);
    const bare = await gather('tonikaku-kawaii-a3860', 'Tonikaku Kawaii');
    expect(bare?.question).not.toHaveProperty('otherNames');
  });
});

describe('tmdbQueries', () => {
  it('asks the same queries as before for a title without other names', () => {
    const input = {
      slug: 'a-b-c-d-e-f-a1',
      name: 'Nothing Here-hen: Sub Story-hen',
    };
    expect(tmdbQueries({ ...input, otherNames: [] })).toEqual(
      tmdbQueries(input),
    );
    expect(tmdbQueries(input)).toHaveLength(5);
  });
});
