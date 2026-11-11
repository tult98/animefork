import { describe, expect, it } from 'vitest';
import { fetchOverview } from '../../../src/art/tmdb/overview.ts';
import { createTmdbClient, TmdbError } from '../../../src/art/tmdb/tmdb.ts';
import * as fx from './fixtures.ts';
import { mockTmdb } from './tmdb-mock.ts';

function client(overrides: Record<string, unknown>) {
  const languages: (string | null)[] = [];
  const base = mockTmdb(overrides);
  const tmdb = createTmdbClient({
    apiKey: 'key',
    fetch: async (input, init) => {
      languages.push(new URL(String(input)).searchParams.get('language'));
      return base(input, init);
    },
  });
  return { tmdb, languages };
}

describe('fetchOverview', () => {
  it('answers the Vietnamese overview without asking for English', async () => {
    const { tmdb, languages } = client({});
    expect(await fetchOverview(tmdb, 100)).toEqual({
      text: fx.DETAIL_100_VI.overview,
      lang: 'vi',
    });
    expect(languages).toEqual(['vi']);
  });

  it('falls back to English when the Vietnamese overview is empty', async () => {
    const { tmdb, languages } = client({
      '/3/tv/100?vi': fx.DETAIL_100_VI_EMPTY,
      '/3/tv/100?en': fx.DETAIL_100_EN,
    });
    expect(await fetchOverview(tmdb, 100)).toEqual({
      text: fx.DETAIL_100_EN.overview,
      lang: 'en',
    });
    expect(languages).toEqual(['vi', 'en']);
  });

  it.each([
    ['empty strings', '', ''],
    ['whitespace and null', '  \n', null],
  ])('answers null when both overviews are %s', async (_, vi, en) => {
    const { tmdb } = client({
      '/3/tv/100?vi': { ...fx.DETAIL_100, overview: vi },
      '/3/tv/100?en': { ...fx.DETAIL_100, overview: en },
    });
    expect(await fetchOverview(tmdb, 100)).toBeNull();
  });

  it('trims the overview it keeps', async () => {
    const { tmdb } = client({
      '/3/tv/100?vi': { ...fx.DETAIL_100, overview: '  Có khoảng trắng.\n' },
    });
    expect(await fetchOverview(tmdb, 100)).toEqual({
      text: 'Có khoảng trắng.',
      lang: 'vi',
    });
  });

  it('throws a TmdbError when TMDB fails on either language', async () => {
    const failsVi = client({ '/3/tv/100?vi': undefined }).tmdb;
    await expect(fetchOverview(failsVi, 100)).rejects.toBeInstanceOf(
      TmdbError,
    );
    const failsEn = client({ '/3/tv/100?vi': fx.DETAIL_100_VI_EMPTY }).tmdb;
    await expect(fetchOverview(failsEn, 100)).rejects.toThrow(
      'TMDB /tv/100 answered 404',
    );
  });

  it('throws on a malformed detail', async () => {
    const { tmdb } = client({ '/3/tv/100?vi': { id: 100 } });
    await expect(fetchOverview(tmdb, 100)).rejects.toThrow();
  });
});
