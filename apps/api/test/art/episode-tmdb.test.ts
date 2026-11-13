import { describe, expect, it, vi } from 'vitest';
import { setup, TONIKAWA } from './helpers.ts';
import { mockTmdb } from './tmdb/tmdb-mock.ts';

function recording() {
  const calls: URL[] = [];
  const base = mockTmdb();
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push(new URL(String(input)));
    return base(input, init);
  };
  return { calls, fetch: fetchImpl };
}

describe('TMDB episode names and overviews', () => {
  it('keeps them from the one season call and translates the English overview', async () => {
    const tmdb = recording();
    const translate = vi.fn(async (text: string) => `vi ${text}`);
    const { store, filler } = setup({
      fetch: tmdb.fetch,
      translator: { translate },
    });

    await filler.fill(TONIKAWA);

    const seasonCalls = tmdb.calls.filter((u) =>
      u.pathname.includes('/season/'),
    );
    expect(
      seasonCalls.map(
        (u) => `${u.pathname}?language=${u.searchParams.get('language')}`,
      ),
    ).toEqual(['/3/tv/100/season/1?language=vi']);
    expect(translate.mock.calls).toEqual([['Nasa meets Tsukasa.']]);
    const info = await store.tmdbEpisodes(TONIKAWA.slug);
    expect(info.get(1)).toMatchObject({
      name: 'Fateful Meeting',
      overview: 'Nasa meets Tsukasa.',
      overviewLang: 'en',
      overviewVi: 'vi Nasa meets Tsukasa.',
    });
    expect(info.get(2)).toMatchObject({
      name: null,
      overviewLang: 'vi',
      overviewVi: 'Nasa gặp lại Tsukasa.',
    });
  });

  it('stores the art and the English overview when the translator fails', async () => {
    const { store, filler } = setup({
      translator: {
        translate: async () => {
          throw new Error('deepseek down');
        },
      },
    });

    await filler.fill(TONIKAWA);

    expect(store.titles.get(TONIKAWA.slug)?.status).toBe('matched');
    expect((await store.tmdbEpisodes(TONIKAWA.slug)).get(1)).toMatchObject({
      overview: 'Nasa meets Tsukasa.',
      overviewVi: null,
    });
  });
});
