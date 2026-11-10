import { describe, expect, it } from 'vitest';
import { RETRY_AFTER_MS } from '../../src/art/retry.ts';
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
    expect(searches).toHaveLength(1);

    now = new Date(now.getTime() + 1);
    expect((await service.lookup({ titles: [NOTHING] })).art).toEqual({
      [NOTHING.slug]: { status: 'pending' },
    });
    await filler.idle();
    expect(searches).toHaveLength(2);
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
    await store.saveMiss(TONIKAWA.slug, 'failed', 'late failure');
    await store.saveMatched({
      title: {
        source_slug: TONIKAWA.slug,
        tmdb_id: 9,
        tmdb_season: 1,
        backdrop_path: '/other.jpg',
        backdrop_lang: null,
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
    expect(searches).toEqual(['Tonikaku Kawaii', 'Nothing Here']);
  });
});
