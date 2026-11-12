import { describe, expect, it } from 'vitest';
import { MemoryMalStore, type StoredMal } from '../../src/mal/mal.store.ts';

const row = (slug: string, over: Partial<StoredMal> = {}): StoredMal => ({
  slug,
  status: 'ok',
  malId: 53913,
  score: 7.9,
  voters: 1000,
  rank: 900,
  popularity: 1500,
  members: 90000,
  airing: 'currently_airing',
  episodes: 12,
  startDate: '2026-01-07',
  startSeason: { year: 2026, season: 'winter' },
  datesKnown: true,
  matchedTitle: 'Tensei shitara Ken deshita II',
  matchScore: 0.912,
  matchedBy: 'jev',
  matcherVersion: 3,
  reason: null,
  attemptedAt: new Date('2026-01-01T00:00:00Z'),
  fetchedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('MemoryMalStore', () => {
  it('round-trips who matched a row, as Postgres does', async () => {
    const store = new MemoryMalStore();
    await store.save(row('by-jev'));
    await store.save(row('by-score', { matchedBy: 'score' }));
    await store.save(
      row('miss', { status: 'none', malId: null, matchedBy: null }),
    );
    const found = await store.find(['by-jev', 'by-score', 'miss']);
    expect(found.get('by-jev')).toEqual(row('by-jev'));
    expect(found.get('by-score')?.matchedBy).toBe('score');
    expect(found.get('miss')?.matchedBy).toBeNull();
  });
});
