import { describe, expect, it } from 'vitest';
import {
  AvsSubmitRequestSchema,
  LookupResponseSchema,
} from '../src/art/contract.ts';
import { AVS_REFRESH_AFTER_MS, isAvsStale } from '../src/ratings/ratings.ts';
import { MemoryRatingsStore } from '../src/ratings/ratings.store.ts';
import { setup, TONIKAWA } from './art/helpers.ts';

const HOUR = 60 * 60_000;

function clock(start = new Date('2026-01-01T00:00:00Z')) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('isAvsStale', () => {
  const now = new Date('2026-01-10T00:00:00Z');
  const row = (fetchedAt: Date | null) => ({
    slug: 'a',
    avsScore: 8,
    avsVoters: 10,
    avsFetchedAt: fetchedAt,
    quality: null,
  });

  it('is stale when nothing was ever fetched', () => {
    expect(isAvsStale(undefined, now)).toBe(true);
    expect(isAvsStale(row(null), now)).toBe(true);
  });

  it('turns stale exactly at the refresh age', () => {
    const at = (age: number) => new Date(now.getTime() - age);
    expect(isAvsStale(row(at(AVS_REFRESH_AFTER_MS - 1)), now)).toBe(false);
    expect(isAvsStale(row(at(AVS_REFRESH_AFTER_MS)), now)).toBe(true);
  });
});

describe('lookup ratings', () => {
  it('flags an unseen title as stale and gives it no ratings', async () => {
    const { service } = setup();
    const res = await service.lookup({ titles: [TONIKAWA] });
    expect(res.avsStale).toEqual([TONIKAWA.slug]);
    expect(res.ratings).toEqual({});
  });

  it('answers stored AVS data and stops flagging until it ages', async () => {
    const c = clock();
    const { service, ratings } = setup({ now: c.now });
    await ratings.saveAvs([
      { slug: TONIKAWA.slug, score: 8.24, voters: 1284, quality: 'HD' },
    ]);
    const fresh = await service.lookup({ titles: [TONIKAWA] });
    expect(fresh.avsStale).toEqual([]);
    expect(fresh.ratings).toEqual({
      [TONIKAWA.slug]: { avs: { score: 8.2, voters: 1284 }, quality: 'HD' },
    });
    c.advance(AVS_REFRESH_AFTER_MS);
    const aged = await service.lookup({ titles: [TONIKAWA] });
    expect(aged.avsStale).toEqual([TONIKAWA.slug]);
    expect(aged.ratings?.[TONIKAWA.slug]?.avs?.voters).toBe(1284);
  });

  it('still parses a response from an API that predates ratings', () => {
    expect(LookupResponseSchema.parse({ art: {} })).toEqual({ art: {} });
  });
});

describe('MemoryRatingsStore.saveAvs', () => {
  it('keeps the last item per slug within one batch', async () => {
    const store = new MemoryRatingsStore(
      () => new Date('2026-01-01T00:00:00Z'),
    );
    await store.saveAvs([
      { slug: 'a', score: 7, voters: 1 },
      { slug: 'a', score: 9, voters: 5 },
    ]);
    expect((await store.find(['a'])).get('a')).toMatchObject({
      avsScore: 9,
      avsVoters: 5,
    });
  });

  it('keeps the stored quality when a later write sends none', async () => {
    const c = clock();
    const store = new MemoryRatingsStore(c.now);
    await store.saveAvs([{ slug: 'a', score: 7, voters: 1, quality: 'HD' }]);
    c.advance(2 * HOUR);
    await store.saveAvs([{ slug: 'a', score: 8, voters: 2 }]);
    expect((await store.find(['a'])).get('a')).toMatchObject({
      avsScore: 8,
      quality: 'HD',
    });
  });

  it('ignores a rewrite right after a fresh write, then accepts one later', async () => {
    const c = clock();
    const store = new MemoryRatingsStore(c.now);
    await store.saveAvs([{ slug: 'a', score: 7, voters: 1 }]);
    c.advance(HOUR / 2);
    await store.saveAvs([{ slug: 'a', score: 1, voters: 99 }]);
    expect((await store.find(['a'])).get('a')?.avsScore).toBe(7);
    c.advance(HOUR);
    await store.saveAvs([{ slug: 'a', score: 6, voters: 2 }]);
    expect((await store.find(['a'])).get('a')?.avsScore).toBe(6);
  });
});

describe('AvsSubmitRequestSchema', () => {
  const item = { slug: 'a-1', score: 8, voters: 3 };

  it('accepts a normal batch', () => {
    expect(AvsSubmitRequestSchema.safeParse({ items: [item] }).success).toBe(
      true,
    );
  });

  it.each([
    ['empty batch', { items: [] }],
    ['score over 10', { items: [{ ...item, score: 10.1 }] }],
    ['negative score', { items: [{ ...item, score: -1 }] }],
    ['negative voters', { items: [{ ...item, voters: -1 }] }],
    ['fractional voters', { items: [{ ...item, voters: 1.5 }] }],
    ['bad slug', { items: [{ ...item, slug: 'Bad Slug' }] }],
    ['too many', { items: Array.from({ length: 51 }, () => item) }],
  ])('rejects %s', (_name, body) => {
    expect(AvsSubmitRequestSchema.safeParse(body).success).toBe(false);
  });
});
