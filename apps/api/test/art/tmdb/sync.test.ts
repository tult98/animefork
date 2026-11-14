import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { BaselineMatcher } from '../../../src/art/tmdb/matcher.ts';
import { syncTitle } from '../../../src/art/tmdb/sync.ts';
import { createTmdbClient, TmdbError } from '../../../src/art/tmdb/tmdb.ts';
import { mockTmdbDetail, mockTmdbImages } from './__mockData__/index.ts';

describe('syncTitle', () => {
  it('matches a title and keeps its backdrop, its poster and the stills of the episodes the source has', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Tonikaku+Kawaii',
        {
          results: [
            {
              id: 100,
              name: 'Tonikaku Kawaii',
              original_name: 'トニカクカワイイ',
              first_air_date: '2020-10-03',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key', mockTmdbDetail)
      .get(
        'https://api.themoviedb.org/3/tv/100/alternative_titles?api_key=key',
        { results: [] },
      )
      .get(
        'https://api.themoviedb.org/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://api.themoviedb.org/3/tv/100/season/1?api_key=key', {
        episodes: [
          { episode_number: 1, still_path: '/e1.jpg' },
          { episode_number: 2, still_path: null },
          { episode_number: 3, still_path: '/e3.jpg' },
          { episode_number: 13, still_path: '/e13.jpg' },
        ],
      });

    const outcome = await syncTitle(
      {
        slug: 'tonikaku-kawaii-a3860',
        name: 'Tonikaku Kawaii',
        year: 2020,
        episodeCount: 12,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: new BaselineMatcher(),
      },
    );

    expect(outcome).toEqual({
      kind: 'matched',
      matched: {
        slug: 'tonikaku-kawaii-a3860',
        tmdbKind: 'tv',
        tmdbId: 100,
        probability: 1,
        title: {
          source_slug: 'tonikaku-kawaii-a3860',
          tmdb_kind: 'tv',
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
        },
        episodes: [
          {
            source_slug: 'tonikaku-kawaii-a3860',
            episode_number: 1,
            still_path: '/e1.jpg',
          },
          {
            source_slug: 'tonikaku-kawaii-a3860',
            episode_number: 3,
            still_path: '/e3.jpg',
          },
        ],
      },
    });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      'begin:https://api.themoviedb.org/3/search/tv',
    );
  });

  it('finds a Vietnamese-named title through the romaji in its slug', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Chuyện+Tình+Trăng+Sao',
        { results: [] },
      )
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=tonikaku+kawaii',
        {
          results: [
            {
              id: 100,
              name: 'Tonikaku Kawaii',
              original_name: 'トニカクカワイイ',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key', mockTmdbDetail)
      .get(
        'https://api.themoviedb.org/3/tv/100/alternative_titles?api_key=key',
        { results: [] },
      )
      .get(
        'https://api.themoviedb.org/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://api.themoviedb.org/3/tv/100/season/1?api_key=key', {
        episodes: [],
      });

    const outcome = await syncTitle(
      {
        slug: 'tonikaku-kawaii-a3860',
        name: 'Chuyện Tình Trăng Sao',
        year: 2020,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: new BaselineMatcher(),
      },
    );

    expect(outcome).toMatchObject({
      kind: 'matched',
      matched: { tmdbId: 100, title: { source_name: 'Chuyện Tình Trăng Sao' } },
    });
  });

  it('skips a title after 5 name and slug searches and 2 searches by other names find no TV series and no movie', async () => {
    fetchMock.get('begin:https://api.themoviedb.org/3/search/', {
      results: [],
    });

    const outcome = await syncTitle(
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
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: new BaselineMatcher(),
      },
    );

    expect(outcome).toEqual({
      kind: 'skipped',
      skipped: { slug: 'a-b-c-d-e-f-a1', reason: 'no TMDB search results' },
    });
    expect(fetchMock).toHaveFetchedTimes(14);
    expect(fetchMock).toHaveFetchedTimes(
      7,
      'begin:https://api.themoviedb.org/3/search/movie',
    );
    expect(fetchMock).toHaveNthFetched(
      1,
      'https://api.themoviedb.org/3/search/tv?api_key=key&query=Nothing+Here-hen%3A+Sub+Story-hen',
    );
    expect(fetchMock).toHaveNthFetched(
      2,
      'https://api.themoviedb.org/3/search/tv?api_key=key&query=Nothing+Here-hen',
    );
    expect(fetchMock).toHaveNthFetched(
      3,
      'https://api.themoviedb.org/3/search/tv?api_key=key&query=Nothing+Here-hen%3A+Sub+Story',
    );
    expect(fetchMock).toHaveNthFetched(
      4,
      'https://api.themoviedb.org/3/search/tv?api_key=key&query=Nothing+Here',
    );
    expect(fetchMock).toHaveNthFetched(
      5,
      'https://api.themoviedb.org/3/search/tv?api_key=key&query=a+b+c+d+e+f',
    );
    expect(fetchMock).toHaveNthFetched(
      6,
      'https://api.themoviedb.org/3/search/tv?api_key=key&query=Soul+Land',
    );
    expect(fetchMock).toHaveNthFetched(
      7,
      'https://api.themoviedb.org/3/search/tv?api_key=key&query=Douluo+Dalu',
    );
  });

  it('skips a title whose best candidate is not a confident match, and says which query found it', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Tonikaku+Kawaii+Gaiden',
        {
          results: [
            {
              id: 100,
              name: 'Tonikaku Kawaii',
              original_name: 'トニカクカワイイ',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key', mockTmdbDetail)
      .get(
        'https://api.themoviedb.org/3/tv/100/alternative_titles?api_key=key',
        { results: [] },
      );

    const outcome = await syncTitle(
      {
        slug: 'tonikaku-kawaii-gaiden-a9',
        name: 'Tonikaku Kawaii Gaiden',
        year: 2008,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: new BaselineMatcher(),
      },
    );

    expect(outcome).toEqual({
      kind: 'skipped',
      skipped: {
        slug: 'tonikaku-kawaii-gaiden-a9',
        reason:
          "no confident match by baseline (best probability 0.65) via query 'Tonikaku Kawaii Gaiden'",
      },
    });
  });

  it('matches a romaji name that only an alternative title on TMDB carries', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Tonikaku+Kawaii',
        {
          results: [
            {
              id: 100,
              name: 'TONIKAWA: Over the Moon for You',
              original_name: 'トニカクカワイイ',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key', {
        ...mockTmdbDetail,
        name: 'TONIKAWA: Over the Moon for You',
      })
      .get(
        'https://api.themoviedb.org/3/tv/100/alternative_titles?api_key=key',
        { results: [{ title: 'Tonikaku Kawaii' }] },
      )
      .get(
        'https://api.themoviedb.org/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://api.themoviedb.org/3/tv/100/season/1?api_key=key', {
        episodes: [],
      });

    const outcome = await syncTitle(
      { slug: 'tonikaku-kawaii-a3860', name: 'Tonikaku Kawaii', year: 2020 },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: new BaselineMatcher(),
      },
    );

    expect(outcome).toMatchObject({
      kind: 'matched',
      matched: { tmdbId: 100 },
    });
  });

  it('reads the season from the name, searches without it, and compares the year with that season’s air date', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Tonikaku+Kawaii',
        {
          results: [
            {
              id: 100,
              name: 'Tonikaku Kawaii',
              original_name: 'トニカクカワイイ',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key', mockTmdbDetail)
      .get(
        'https://api.themoviedb.org/3/tv/100/alternative_titles?api_key=key',
        { results: [] },
      )
      .get(
        'https://api.themoviedb.org/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://api.themoviedb.org/3/tv/100/season/2?api_key=key', {
        episodes: [{ episode_number: 1, still_path: '/s2e1.jpg' }],
      });

    const outcome = await syncTitle(
      {
        slug: 'tonikaku-kawaii-2nd-season-a4500',
        name: 'Tonikaku Kawaii 2nd Season',
        year: 2023,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: new BaselineMatcher(),
      },
    );

    expect(outcome).toMatchObject({
      kind: 'matched',
      matched: {
        title: { tmdb_id: 100, tmdb_season: 2, match_scope: 'season' },
        episodes: [
          {
            source_slug: 'tonikaku-kawaii-2nd-season-a4500',
            episode_number: 1,
            still_path: '/s2e1.jpg',
          },
        ],
      },
    });
  });

  it('keeps the show’s backdrop and poster but no stills when TMDB does not have the season', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Tonikaku+Kawaii',
        {
          results: [
            {
              id: 100,
              name: 'Tonikaku Kawaii',
              original_name: 'トニカクカワイイ',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key', mockTmdbDetail)
      .get(
        'https://api.themoviedb.org/3/tv/100/alternative_titles?api_key=key',
        { results: [] },
      )
      .get(
        'https://api.themoviedb.org/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      );

    const outcome = await syncTitle(
      {
        slug: 'tonikaku-kawaii-5th-season-a9000',
        name: 'Tonikaku Kawaii',
        seasonName: 'Season 5',
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: new BaselineMatcher(),
      },
    );

    expect(outcome).toMatchObject({
      kind: 'matched',
      matched: {
        title: {
          tmdb_id: 100,
          tmdb_season: null,
          match_scope: 'show',
          backdrop_path: '/en.jpg',
          poster_path: '/poster-vi.jpg',
        },
        episodes: [],
      },
    });
    expect(fetchMock).not.toHaveFetched(
      'begin:https://api.themoviedb.org/3/tv/100/season/',
    );
  });

  it('throws a TmdbError when TMDB fails in the middle of a sync, so the title is not stored as unmatched', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Tonikaku+Kawaii',
        {
          results: [
            {
              id: 100,
              name: 'Tonikaku Kawaii',
              original_name: 'トニカクカワイイ',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key', mockTmdbDetail)
      .get(
        'https://api.themoviedb.org/3/tv/100/alternative_titles?api_key=key',
        { results: [] },
      )
      .get(
        'https://api.themoviedb.org/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        503,
      )
      .get('https://api.themoviedb.org/3/tv/100/season/1?api_key=key', {
        episodes: [],
      });

    const call = syncTitle(
      { slug: 'tonikaku-kawaii-a3860', name: 'Tonikaku Kawaii', year: 2020 },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: new BaselineMatcher(),
      },
    );

    await expect(call).rejects.toThrow(new TmdbError(503, '/tv/100/images'));
  });
});
