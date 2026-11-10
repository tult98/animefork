import { describe, expect, it } from 'vitest';
import { lookup } from '../src/lookup.ts';
import { RETRY_AFTER_MS } from '../src/retry.ts';
import { NOTHING, setup, TONIKAWA } from './helpers.ts';
import { mockTmdb } from './tmdb-mock.ts';

describe('lookup', () => {
  it('answers pending for a miss, fills in the background, then answers ready', async () => {
    const { store, filler, searches } = setup();
    const deps = { store, filler, now: new Date() };
    const first = await lookup({ titles: [TONIKAWA] }, deps);
    expect(first.art).toEqual({ [TONIKAWA.slug]: { status: 'pending' } });
    expect(filler.has(TONIKAWA.slug)).toBe(true);

    expect((await lookup({ titles: [TONIKAWA] }, deps)).art).toEqual({
      [TONIKAWA.slug]: { status: 'pending' },
    });
    await filler.idle();
    expect(searches).toHaveLength(1);

    const later = await lookup({ titles: [TONIKAWA] }, deps);
    expect(later.art[TONIKAWA.slug]).toEqual({
      status: 'ready',
      backdropPath: '/en.jpg',
      backdropLang: 'en',
    });
  });

  it('adds stills only when episodes are asked for', async () => {
    const { store, filler } = setup();
    const deps = { store, filler, now: new Date() };
    await filler.fill(TONIKAWA);
    const plain = await lookup({ titles: [TONIKAWA] }, deps);
    expect(plain.art[TONIKAWA.slug]).not.toHaveProperty('stills');
    const withEpisodes = await lookup(
      { titles: [TONIKAWA], episodes: true },
      deps,
    );
    expect(withEpisodes.art[TONIKAWA.slug]).toMatchObject({
      status: 'ready',
      stills: { '1': '/e1.jpg', '3': '/e3.jpg' },
    });
  });

  it('answers none for a no_match row inside its window and refills after it', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const { store, filler, searches } = setup({ now: () => now });
    await filler.fill(NOTHING);
    const deps = () => ({ store, filler, now });

    now = new Date(now.getTime() + RETRY_AFTER_MS.no_match - 1);
    expect((await lookup({ titles: [NOTHING] }, deps())).art).toEqual({
      [NOTHING.slug]: { status: 'none' },
    });
    expect(searches).toHaveLength(1);

    now = new Date(now.getTime() + 1);
    expect((await lookup({ titles: [NOTHING] }, deps())).art).toEqual({
      [NOTHING.slug]: { status: 'pending' },
    });
    await filler.idle();
    expect(searches).toHaveLength(2);
  });

  it('answers none for a failed row inside its window', async () => {
    const failing = mockTmdb({ '/3/tv/100/images': undefined });
    const { store, filler } = setup({ fetch: failing });
    await filler.fill(TONIKAWA);
    const out = await lookup(
      { titles: [TONIKAWA] },
      { store, filler, now: new Date() },
    );
    expect(out.art[TONIKAWA.slug]).toEqual({ status: 'none' });
  });

  it('never replaces a matched row', async () => {
    const { store, filler } = setup();
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
    const out = await lookup(
      { titles: [TONIKAWA], episodes: true },
      { store, filler, now: new Date() },
    );
    expect(out.art[TONIKAWA.slug]).toMatchObject({
      status: 'ready',
      backdropPath: '/en.jpg',
      stills: { '1': '/e1.jpg', '3': '/e3.jpg' },
    });
  });

  it('answers each slug once when a request repeats it', async () => {
    const { store, filler, searches } = setup();
    const out = await lookup(
      { titles: [TONIKAWA, TONIKAWA, NOTHING] },
      { store, filler, now: new Date() },
    );
    expect(Object.keys(out.art)).toEqual([TONIKAWA.slug, NOTHING.slug]);
    await filler.idle();
    expect(searches).toEqual(['Tonikaku Kawaii', 'Nothing Here']);
  });
});
