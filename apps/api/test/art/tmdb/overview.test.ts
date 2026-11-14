import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { fetchOverview } from '../../../src/art/tmdb/overview.ts';
import { createTmdbClient, TmdbError } from '../../../src/art/tmdb/tmdb.ts';
import { mockTmdbDetail } from './__mockData__/index.ts';

describe('fetchOverview', () => {
  it('answers the Vietnamese overview, trimmed, without asking for the English one', async () => {
    fetchMock.get(
      'https://api.themoviedb.org/3/tv/100?api_key=key&language=vi',
      {
        ...mockTmdbDetail,
        overview: '  Nasa gặp Tsukasa và cầu hôn cô ngay tại chỗ.\n',
      },
    );

    const overview = await fetchOverview(
      createTmdbClient({ apiKey: 'key' }),
      'tv',
      100,
    );

    expect(overview).toEqual({
      text: 'Nasa gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
      lang: 'vi',
    });
    expect(fetchMock).not.toHaveFetched(
      'https://api.themoviedb.org/3/tv/100?api_key=key&language=en',
    );
  });

  it('answers the English overview when TMDB has no Vietnamese one', async () => {
    fetchMock
      .get('https://api.themoviedb.org/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbDetail,
        overview: '',
      })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key&language=en', {
        ...mockTmdbDetail,
        overview: 'Nasa meets Tsukasa and proposes to her on the spot.',
      });

    const overview = await fetchOverview(
      createTmdbClient({ apiKey: 'key' }),
      'tv',
      100,
    );

    expect(overview).toEqual({
      text: 'Nasa meets Tsukasa and proposes to her on the spot.',
      lang: 'en',
    });
  });

  it('answers null when both overviews are blank or missing', async () => {
    fetchMock
      .get('https://api.themoviedb.org/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbDetail,
        overview: '  \n',
      })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key&language=en', {
        ...mockTmdbDetail,
        overview: null,
      });

    const overview = await fetchOverview(
      createTmdbClient({ apiKey: 'key' }),
      'tv',
      100,
    );

    expect(overview).toBeNull();
  });

  it('throws a TmdbError when TMDB fails, so the caller can tell a failure from a show without an overview', async () => {
    fetchMock
      .get('https://api.themoviedb.org/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbDetail,
        overview: '',
      })
      .get('https://api.themoviedb.org/3/tv/100?api_key=key&language=en', 503);

    const call = fetchOverview(createTmdbClient({ apiKey: 'key' }), 'tv', 100);

    await expect(call).rejects.toThrow(new TmdbError(503, '/tv/100'));
  });
});
