import { describe, expect, it } from 'vitest';
import { NOTHING, setup, TONIKAWA } from './helpers.ts';
import { DETAIL_100_VI } from './tmdb/fixtures.ts';
import { mockTmdb } from './tmdb/tmdb-mock.ts';

describe('ArtFiller', () => {
  it('runs one TMDB sync for concurrent fills of the same slug', async () => {
    const { store, filler, searches } = setup();
    const fills = Array.from({ length: 5 }, () => filler.fill(TONIKAWA));
    expect(filler.has(TONIKAWA.slug)).toBe(true);
    await Promise.all(fills);
    expect(searches).toEqual(['Tonikaku Kawaii']);
    expect(filler.has(TONIKAWA.slug)).toBe(false);
    expect(store.titles.get(TONIKAWA.slug)?.status).toBe('matched');
  });

  it('stores a show-scope match with art and no stills, and serves it', async () => {
    const { store, filler, service } = setup({
      matcher: {
        match: async () => ({
          choice: 100,
          probability: 0.9,
          by: 'jev',
          scope: 'show',
        }),
      },
    });
    await filler.fill({ ...TONIKAWA, seasonName: 'Season 3' });
    expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
      status: 'matched',
      matchScope: 'show',
      tmdbSeason: null,
      backdropPath: '/en.jpg',
      posterPath: '/poster-vi.jpg',
    });
    expect((await store.episodes(TONIKAWA.slug)).size).toBe(0);
    const out = await service.lookup({ titles: [TONIKAWA], episodes: true });
    expect(out.art[TONIKAWA.slug]).toEqual({
      status: 'ready',
      backdropPath: '/en.jpg',
      backdropLang: 'en',
      posterPath: '/poster-vi.jpg',
      overview: DETAIL_100_VI.overview,
      overviewTranslated: false,
      stills: {},
    });
  });

  it('skips TMDB when a settled row landed before its turn', async () => {
    const { store, filler, searches } = setup();
    await filler.fill(TONIKAWA);
    await filler.fill(TONIKAWA);
    expect(searches).toHaveLength(1);
    expect(store.titles.size).toBe(1);
  });

  it('runs at most the concurrency cap at once, in order', async () => {
    let active = 0;
    let peak = 0;
    const started: string[] = [];
    const base = mockTmdb();
    const slow: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/search/tv')) {
        started.push(url.searchParams.get('query') ?? '');
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      }
      return base(input, init);
    };
    const { filler } = setup({ fetch: slow, concurrency: 2 });
    const names = ['A', 'B', 'C', 'D', 'E'];
    await Promise.all(
      names.map((n) => filler.fill({ slug: n.toLowerCase(), name: n })),
    );
    expect(peak).toBe(2);
    expect(started).toEqual(names);
  });

  it('stores no_match for a confident miss and failed for a thrown error', async () => {
    const failing = mockTmdb({ '/3/tv/100/images': undefined });
    const { store, filler } = setup({ fetch: failing });
    await Promise.all([filler.fill(NOTHING), filler.fill(TONIKAWA)]);
    expect(store.titles.get(NOTHING.slug)).toMatchObject({
      status: 'no_match',
      reason: 'no TMDB search results',
    });
    expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
      status: 'failed',
      reason: 'TMDB /tv/100/images answered 404',
    });
  });

  it('resolves and frees the slug when the store throws', async () => {
    const { store, filler } = setup();
    store.saveMatched = async () => {
      throw new Error('db down');
    };
    await expect(filler.fill(TONIKAWA)).resolves.toBeUndefined();
    expect(filler.has(TONIKAWA.slug)).toBe(false);
  });
});
