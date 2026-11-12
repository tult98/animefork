import { describe, expect, it } from 'vitest';
import { ArtService } from '../../src/art/art.service.ts';
import { RETRY_AFTER_MS } from '../../src/art/retry.ts';
import { MemoryTitleNamesStore } from '../../src/art/title-names.store.ts';
import type { MalCandidate, MalClient } from '../../src/mal/mal.client.ts';
import { MalFiller } from '../../src/mal/mal.filler.ts';
import { MemoryMalStore } from '../../src/mal/mal.store.ts';
import { candidate } from '../mal/helpers.ts';
import { setup, TONIKAWA } from './helpers.ts';
import * as fx from './tmdb/fixtures.ts';
import { mockTmdb } from './tmdb/tmdb-mock.ts';

const DONGHUA = {
  slug: 'dau-la-dai-luc-a1234',
  name: 'Đấu La Đại Lục',
  year: 2018,
  episodeCount: 52,
};
const NAMES = ['Douluo Dalu', 'Soul Land'];

const SOUL_LAND = candidate({
  id: 36027,
  title: 'Douluo Dalu',
  english: 'Soul Land',
  year: 2018,
  episodes: 52,
  mediaType: 'ona',
});

const emptySearch = mockTmdb({
  ...Object.fromEntries(
    [DONGHUA.name, 'dau la dai luc', 'dau la dai', ...NAMES].map((q) => [
      `/3/search/tv?${q}`,
      fx.SEARCH_NOTHING,
    ]),
  ),
});

function world(
  options: {
    fetch?: typeof fetch;
    mal?: Record<string, MalCandidate[]>;
  } = {},
) {
  let t = new Date('2026-01-01T00:00:00Z').getTime();
  const now = () => new Date(t);
  const base = setup({ now, fetch: options.fetch ?? emptySearch });
  const mal = new MemoryMalStore(now);
  const names = new MemoryTitleNamesStore();
  const malSearches: string[] = [];
  const client: MalClient = {
    search: async (q) => {
      malSearches.push(q);
      return options.mal?.[q] ?? [];
    },
    stats: async () => null,
  };
  const malFiller = new MalFiller(mal, client, now);
  const service = new ArtService(
    base.store,
    base.filler,
    now,
    base.ratings,
    mal,
    malFiller,
    null,
    names,
  );
  const idle = () => Promise.all([base.filler.idle(), malFiller.idle()]);
  return {
    ...base,
    service,
    mal,
    names,
    malSearches,
    idle,
    advance: (ms: number) => (t += ms),
    now,
  };
}

describe('lookup with other names', () => {
  it('stores the names of a title with something to gain and hands them to both fillers', async () => {
    const w = world({ mal: { 'Soul Land': [SOUL_LAND] } });
    await w.service.lookup({ titles: [{ ...DONGHUA, otherNames: NAMES }] });
    await w.idle();
    expect(w.names.rows.get(DONGHUA.slug)).toEqual({
      names: NAMES,
      updatedAt: w.now(),
    });
    expect(w.malSearches.slice(0, 2)).toEqual(NAMES);
    expect(w.searches).toEqual(expect.arrayContaining(NAMES));
    expect(w.mal.rows.get(DONGHUA.slug)).toMatchObject({
      status: 'ok',
      malId: SOUL_LAND.id,
      matchedBy: 'score',
    });
  });

  it('saves nothing when the request carries no names', async () => {
    const w = world();
    await w.service.lookup({ titles: [DONGHUA] });
    await w.idle();
    expect(w.names.rows.size).toBe(0);
    expect(w.malSearches).not.toContain('Soul Land');
  });

  it('ignores names for a title whose MAL row is ok and whose art is matched', async () => {
    const w = world({
      fetch: mockTmdb(),
      mal: {
        'Tonikaku Kawaii': [
          candidate({ title: 'Tonikaku Kawaii', year: 2020, episodes: 12 }),
        ],
      },
    });
    await w.service.lookup({ titles: [TONIKAWA] });
    await w.idle();
    expect(w.store.titles.get(TONIKAWA.slug)?.status).toBe('matched');
    expect(w.mal.rows.get(TONIKAWA.slug)?.status).toBe('ok');
    const out = await w.service.lookup({
      titles: [
        { ...TONIKAWA, otherNames: ['TONIKAWA: Over the Moon For You'] },
      ],
    });
    expect(w.names.rows.size).toBe(0);
    expect(w.filler.has(TONIKAWA.slug)).toBe(false);
    expect(out.ratingsPending).toBeUndefined();
  });

  it('accepts names while only one of the two matches is settled', async () => {
    const w = world({ fetch: mockTmdb() });
    await w.service.lookup({ titles: [TONIKAWA] });
    await w.idle();
    expect(w.store.titles.get(TONIKAWA.slug)?.status).toBe('matched');
    expect(w.mal.rows.get(TONIKAWA.slug)?.status).toBe('none');
    await w.service.lookup({
      titles: [{ ...TONIKAWA, otherNames: ['TONIKAWA'] }],
    });
    expect(w.names.rows.get(TONIKAWA.slug)?.names).toEqual(['TONIKAWA']);

    const art = world({
      mal: {
        'Đấu La Đại Lục': [candidate({ ...SOUL_LAND, title: DONGHUA.name })],
      },
    });
    await art.service.lookup({ titles: [DONGHUA] });
    await art.idle();
    expect(art.store.titles.get(DONGHUA.slug)?.status).toBe('no_match');
    expect(art.mal.rows.get(DONGHUA.slug)?.status).toBe('ok');
    await art.service.lookup({ titles: [{ ...DONGHUA, otherNames: NAMES }] });
    expect(art.names.rows.get(DONGHUA.slug)?.names).toEqual(NAMES);
  });

  it('uses stored names for a later lookup that carries none, and keeps the first names sent', async () => {
    const w = world();
    await w.service.lookup({ titles: [{ ...DONGHUA, otherNames: NAMES }] });
    await w.idle();
    await w.service.lookup({
      titles: [{ ...DONGHUA, otherNames: ['Rewritten'] }],
    });
    expect(w.names.rows.get(DONGHUA.slug)?.names).toEqual(NAMES);

    w.advance(RETRY_AFTER_MS.no_match);
    w.malSearches.length = 0;
    w.searches.length = 0;
    await w.service.lookup({ titles: [DONGHUA] });
    await w.idle();
    expect(w.malSearches.slice(0, 2)).toEqual(NAMES);
    expect(w.malSearches).not.toContain('Rewritten');
    expect(w.searches).toEqual(expect.arrayContaining(NAMES));
  });
});

describe('retry when other names arrive', () => {
  it('matches a MAL miss and an art miss once more, then settles them', async () => {
    const w = world({ mal: { 'Soul Land': [SOUL_LAND] } });
    await w.service.lookup({ titles: [DONGHUA] });
    await w.idle();
    expect(w.mal.rows.get(DONGHUA.slug)?.status).toBe('none');
    expect(w.store.titles.get(DONGHUA.slug)?.status).toBe('no_match');
    const malBefore = w.malSearches.length;
    const tmdbBefore = w.searches.length;

    w.advance(1000);
    const retry = await w.service.lookup({
      titles: [{ ...DONGHUA, otherNames: NAMES }],
    });
    expect(retry.art[DONGHUA.slug]).toEqual({ status: 'pending' });
    expect(retry.ratingsPending).toBe(true);
    await w.idle();
    expect(w.malSearches.length).toBeGreaterThan(malBefore);
    expect(w.searches.length).toBeGreaterThan(tmdbBefore);
    expect(w.mal.rows.get(DONGHUA.slug)?.status).toBe('ok');
    expect(w.store.titles.get(DONGHUA.slug)?.status).toBe('no_match');

    const malAfter = w.malSearches.length;
    const tmdbAfter = w.searches.length;
    w.advance(1000);
    const settled = await w.service.lookup({ titles: [DONGHUA] });
    await w.idle();
    expect(settled.art[DONGHUA.slug]).toEqual({ status: 'none' });
    expect(settled.ratingsPending).toBeUndefined();
    expect(w.malSearches).toHaveLength(malAfter);
    expect(w.searches).toHaveLength(tmdbAfter);
  });

  it('settles a miss tried in the same instant the names were stored', async () => {
    const w = world();
    await w.service.lookup({ titles: [{ ...DONGHUA, otherNames: NAMES }] });
    await w.idle();
    const malSearches = w.malSearches.length;
    const tmdbSearches = w.searches.length;
    const again = await w.service.lookup({ titles: [DONGHUA] });
    await w.idle();
    expect(again.art[DONGHUA.slug]).toEqual({ status: 'none' });
    expect(w.malSearches).toHaveLength(malSearches);
    expect(w.searches).toHaveLength(tmdbSearches);
  });
});
