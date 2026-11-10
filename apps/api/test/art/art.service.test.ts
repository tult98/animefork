import { describe, expect, it } from 'vitest';
import {
  MATCHED_REFRESH_BELOW,
  MISS_RETRY_BELOW,
  RETRY_AFTER_MS,
} from '../../src/art/retry.ts';
import type { StoredTitle } from '../../src/art/art.store.ts';
import { NOTHING, setup, TONIKAWA } from './helpers.ts';
import { mockTmdb } from './tmdb/tmdb-mock.ts';

describe('ArtService.lookup', () => {
  it('answers pending for a miss, fills in the background, then answers ready', async () => {
    const { service, filler, searches } = setup();
    const first = await service.lookup({ titles: [TONIKAWA] });
    expect(first.art).toEqual({ [TONIKAWA.slug]: { status: 'pending' } });
    expect(filler.has(TONIKAWA.slug)).toBe(true);

    expect((await service.lookup({ titles: [TONIKAWA] })).art).toEqual({
      [TONIKAWA.slug]: { status: 'pending' },
    });
    await filler.idle();
    expect(searches).toHaveLength(1);

    const later = await service.lookup({ titles: [TONIKAWA] });
    expect(later.art[TONIKAWA.slug]).toEqual({
      status: 'ready',
      backdropPath: '/en.jpg',
      backdropLang: 'en',
      posterPath: '/poster-vi.jpg',
    });
  });

  it('adds stills only when episodes are asked for', async () => {
    const { service, filler } = setup();
    await filler.fill(TONIKAWA);
    const plain = await service.lookup({ titles: [TONIKAWA] });
    expect(plain.art[TONIKAWA.slug]).not.toHaveProperty('stills');
    const withEpisodes = await service.lookup({
      titles: [TONIKAWA],
      episodes: true,
    });
    expect(withEpisodes.art[TONIKAWA.slug]).toMatchObject({
      status: 'ready',
      stills: { '1': '/e1.jpg', '3': '/e3.jpg' },
    });
  });

  it('answers none for a no_match row inside its window and refills after it', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const { service, filler, searches } = setup({ now: () => now });
    await filler.fill(NOTHING);

    now = new Date(now.getTime() + RETRY_AFTER_MS.no_match - 1);
    expect((await service.lookup({ titles: [NOTHING] })).art).toEqual({
      [NOTHING.slug]: { status: 'none' },
    });
    expect(searches).toHaveLength(2);

    now = new Date(now.getTime() + 1);
    expect((await service.lookup({ titles: [NOTHING] })).art).toEqual({
      [NOTHING.slug]: { status: 'pending' },
    });
    await filler.idle();
    expect(searches).toHaveLength(4);
  });

  it('answers none for a failed row inside its window', async () => {
    const failing = mockTmdb({ '/3/tv/100/images': undefined });
    const { service, filler } = setup({ fetch: failing });
    await filler.fill(TONIKAWA);
    const out = await service.lookup({ titles: [TONIKAWA] });
    expect(out.art[TONIKAWA.slug]).toEqual({ status: 'none' });
  });

  it('never replaces a matched row', async () => {
    const { service, store, filler } = setup();
    await filler.fill(TONIKAWA);
    await store.saveMiss(TONIKAWA, 'failed', 'late failure');
    await store.saveMatched({
      title: {
        source_slug: TONIKAWA.slug,
        tmdb_id: 9,
        tmdb_season: 1,
        match_scope: 'season',
        backdrop_path: '/other.jpg',
        backdrop_lang: null,
        poster_path: '/other-poster.jpg',
        poster_lang: null,
        source_name: TONIKAWA.name,
        source_year: null,
        source_episode_count: null,
        matched_by: 'baseline',
      },
      episodes: [],
    });
    const out = await service.lookup({ titles: [TONIKAWA], episodes: true });
    expect(out.art[TONIKAWA.slug]).toMatchObject({
      status: 'ready',
      backdropPath: '/en.jpg',
      stills: { '1': '/e1.jpg', '3': '/e3.jpg' },
    });
  });

  it('answers each slug once when a request repeats it', async () => {
    const { service, filler, searches } = setup();
    const out = await service.lookup({
      titles: [TONIKAWA, TONIKAWA, NOTHING],
    });
    expect(Object.keys(out.art)).toEqual([TONIKAWA.slug, NOTHING.slug]);
    await filler.idle();
    expect(searches).toEqual(['Tonikaku Kawaii', 'Nothing Here', 'nothing']);
  });

  const storedRow = (over: Partial<StoredTitle>): StoredTitle => ({
    slug: TONIKAWA.slug,
    status: 'matched',
    tmdbId: 100,
    tmdbSeason: 1,
    matchScope: 'season',
    backdropPath: '/old.jpg',
    backdropLang: null,
    posterPath: null,
    posterLang: null,
    reason: null,
    matcherVersion: MATCHED_REFRESH_BELOW - 1,
    attemptedAt: new Date(),
    sourceName: null,
    sourceYear: null,
    sourceEpisodeCount: null,
    matchedBy: null,
    ...over,
  });

  it('does not refresh a matched row written by version 2', async () => {
    const { service, store, filler, searches } = setup();
    store.titles.set(
      TONIKAWA.slug,
      storedRow({ matcherVersion: MATCHED_REFRESH_BELOW }),
    );
    const out = await service.lookup({ titles: [TONIKAWA] });
    expect(out.art[TONIKAWA.slug]).toMatchObject({ status: 'ready' });
    expect(filler.has(TONIKAWA.slug)).toBe(false);
    expect(searches).toEqual([]);
  });

  it.each(['no_match', 'failed'] as const)(
    'retries a fresh %s row written below version 4 on its next lookup',
    async (status) => {
      const { service, store, filler } = setup();
      store.titles.set(
        TONIKAWA.slug,
        storedRow({
          status,
          tmdbId: null,
          tmdbSeason: null,
          backdropPath: null,
          matcherVersion: MISS_RETRY_BELOW - 1,
        }),
      );
      const out = await service.lookup({ titles: [TONIKAWA] });
      expect(out.art[TONIKAWA.slug]).toEqual({ status: 'pending' });
      await filler.idle();
      expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
        status: 'matched',
        matcherVersion: MISS_RETRY_BELOW,
        sourceName: TONIKAWA.name,
        sourceYear: TONIKAWA.year,
        sourceEpisodeCount: TONIKAWA.episodeCount,
        matchedBy: 'baseline',
      });
    },
  );

  describe('a matched row from an older matcher version', () => {
    const stale = (store: ReturnType<typeof setup>['store']) => {
      store.titles.set(TONIKAWA.slug, storedRow({}));
    };

    it('answers ready at once with what is stored and refills in the background', async () => {
      const { service, store, filler, searches } = setup();
      stale(store);
      const first = await service.lookup({ titles: [TONIKAWA] });
      expect(first.art[TONIKAWA.slug]).toEqual({
        status: 'ready',
        backdropPath: '/old.jpg',
        backdropLang: null,
        posterPath: null,
      });
      expect(filler.has(TONIKAWA.slug)).toBe(true);
      await service.lookup({ titles: [TONIKAWA] });
      await filler.idle();
      expect(searches).toHaveLength(1);

      const later = await service.lookup({ titles: [TONIKAWA] });
      expect(later.art[TONIKAWA.slug]).toMatchObject({
        status: 'ready',
        backdropPath: '/en.jpg',
        posterPath: '/poster-vi.jpg',
      });
      await service.lookup({ titles: [TONIKAWA] });
      expect(filler.has(TONIKAWA.slug)).toBe(false);
      expect(searches).toHaveLength(1);
    });

    it('keeps the old row when the refill fails or finds no match', async () => {
      const failing = mockTmdb({ '/3/tv/100/images': undefined });
      const { service, store, filler } = setup({ fetch: failing });
      stale(store);
      await service.lookup({ titles: [TONIKAWA] });
      await filler.idle();
      expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
        status: 'matched',
        backdropPath: '/old.jpg',
        matcherVersion: MATCHED_REFRESH_BELOW - 1,
      });
      const out = await service.lookup({ titles: [TONIKAWA] });
      expect(out.art[TONIKAWA.slug]).toMatchObject({
        status: 'ready',
        backdropPath: '/old.jpg',
        posterPath: null,
      });
      await filler.idle();

      await filler.fill({ ...NOTHING, slug: TONIKAWA.slug });
      expect(store.titles.get(TONIKAWA.slug)?.status).toBe('matched');
    });
  });
});
