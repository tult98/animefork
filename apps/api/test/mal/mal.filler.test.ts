import { describe, expect, it } from 'vitest';
import {
  MalError,
  type MalCandidate,
  type MalClient,
} from '../../src/mal/mal.client.ts';
import { MAX_QUERIES, MalFiller } from '../../src/mal/mal.filler.ts';
import {
  MAL_REFRESH_AFTER_MS,
  MAL_RETRY_AFTER_MS,
} from '../../src/mal/mal.retry.ts';
import { MemoryMalStore } from '../../src/mal/mal.store.ts';
import { candidate } from './helpers.ts';

const INPUT = {
  slug: 'black-clover-a1',
  name: 'Black Clover',
  year: 2017,
  episodeCount: 170,
};

function setup(over: Partial<MalClient> = {}) {
  let t = new Date('2026-01-01T00:00:00Z').getTime();
  const now = () => new Date(t);
  const store = new MemoryMalStore(now);
  const searches: string[] = [];
  const statsCalls: number[] = [];
  const client: MalClient = {
    search: async (q) => {
      searches.push(q);
      return [candidate()];
    },
    stats: async (id) => {
      statsCalls.push(id);
      return {
        id,
        score: 8,
        voters: 100,
        rank: 10,
        popularity: 20,
        members: 300,
        airing: 'finished_airing',
        episodes: 12,
        startDate: '2017-10-03',
        startSeason: { year: 2017, season: 'fall' },
        broadcast: { day: 'tuesday', time: '18:25' },
      };
    },
    ...over,
  };
  const filler = new MalFiller(store, client, now);
  return {
    store,
    filler,
    searches,
    statsCalls,
    advance: (ms: number) => (t += ms),
  };
}

describe('MalFiller.fill', () => {
  it('matches a title and stores its MAL numbers with the match provenance', async () => {
    const { filler, store, searches } = setup();
    await filler.fill(INPUT);
    expect(searches).toEqual(['Black Clover']);
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      status: 'ok',
      malId: 1,
      score: 7.55,
      voters: 69596,
      rank: 2006,
      popularity: 1762,
      members: 157000,
      airing: 'finished_airing',
      episodes: 170,
      startDate: null,
      startSeason: { year: 2017, season: 'fall' },
      broadcast: { day: 'tuesday', time: '18:25' },
      datesKnown: true,
      matchedTitle: 'Black Clover',
      reason: null,
    });
    expect(store.rows.get(INPUT.slug)?.matchScore).toBeGreaterThan(0.9);
  });

  it('keeps a broadcast the refresh finds, and clears one MAL dropped', async () => {
    const { filler, store, advance } = setup({
      stats: async (id) => ({
        id,
        score: 8,
        voters: 1,
        rank: 1,
        popularity: 1,
        members: 1,
        airing: 'currently_airing',
        episodes: 12,
        startDate: null,
        startSeason: null,
        broadcast: null,
      }),
    });
    await filler.fill(INPUT);
    expect(store.rows.get(INPUT.slug)?.broadcast).toEqual({
      day: 'tuesday',
      time: '18:25',
    });
    advance(MAL_REFRESH_AFTER_MS);
    await filler.fill(INPUT);
    expect(store.rows.get(INPUT.slug)?.broadcast).toBeNull();
  });

  it('tries the next query when the first finds nothing, up to a limit', async () => {
    const searches: string[] = [];
    const { filler, store } = setup({
      search: async (q) => {
        searches.push(q);
        return [];
      },
    });
    await filler.fill({
      ...INPUT,
      name: 'Black Clover: Sword of the Wizard King Arc',
    });
    expect(searches.length).toBeLessThanOrEqual(MAX_QUERIES);
    expect(searches.length).toBeGreaterThan(1);
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      status: 'none',
      malId: null,
    });
  });

  it('searches the aliases only after the source name finds nothing', async () => {
    const searches: string[] = [];
    const conan = candidate({
      id: 235,
      title: 'Meitantei Conan',
      english: 'Case Closed',
      year: 1996,
      episodes: undefined,
    });
    const { filler, store } = setup({
      search: async (q) => {
        searches.push(q);
        return q === 'Case Closed' ? [conan] : [];
      },
    });
    await filler.fill(
      { slug: 'tham-tu-lung-danh-conan-a3', name: 'Thám Tử Lừng Danh Conan' },
      async () => ['Case Closed'],
    );
    expect(searches.at(-1)).toBe('Case Closed');
    expect(store.rows.get('tham-tu-lung-danh-conan-a3')).toMatchObject({
      status: 'ok',
      malId: 235,
    });
  });

  it('never asks for aliases when the source name already matches', async () => {
    let asked = false;
    const { filler } = setup();
    await filler.fill(INPUT, async () => {
      asked = true;
      return [];
    });
    expect(asked).toBe(false);
  });

  it('stores a no-match when candidates exist but none clears the bar', async () => {
    const { filler, store } = setup({
      search: async () => [candidate({ title: 'Naruto', year: 2002 })],
    });
    await filler.fill(INPUT);
    expect(store.rows.get(INPUT.slug)).toMatchObject({ status: 'none' });
  });

  it('stores a failure with its reason when MAL errors', async () => {
    const { filler, store } = setup({
      search: async () => {
        throw new MalError('MAL /anime answered 429', 429);
      },
    });
    await filler.fill(INPUT);
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('429'),
    });
  });

  it('asks MAL once for a title requested twice at the same time', async () => {
    const { filler, searches } = setup();
    await Promise.all([filler.fill(INPUT), filler.fill(INPUT)]);
    expect(searches).toHaveLength(1);
    expect(filler.has(INPUT.slug)).toBe(false);
  });

  it('does nothing again while the row is settled', async () => {
    const { filler, searches, advance } = setup();
    await filler.fill(INPUT);
    advance(MAL_REFRESH_AFTER_MS - 1000);
    await filler.fill(INPUT);
    expect(searches).toHaveLength(1);
  });

  it('refreshes an old row by its MAL id without searching again', async () => {
    const { filler, store, searches, statsCalls, advance } = setup();
    await filler.fill(INPUT);
    advance(MAL_REFRESH_AFTER_MS);
    await filler.fill(INPUT);
    expect(searches).toHaveLength(1);
    expect(statsCalls).toEqual([1]);
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      status: 'ok',
      malId: 1,
      score: 8,
      voters: 100,
      rank: 10,
      matchedTitle: 'Black Clover',
    });
  });

  it('refreshes a stored row that has no start dates yet and records them', async () => {
    const { filler, store, statsCalls } = setup();
    await filler.fill(INPUT);
    store.rows.set(INPUT.slug, {
      ...store.rows.get(INPUT.slug)!,
      startDate: null,
      startSeason: null,
      broadcast: null,
      datesKnown: false,
    });
    await filler.fill(INPUT);
    expect(statsCalls).toEqual([]);
    store.rows.set(INPUT.slug, {
      ...store.rows.get(INPUT.slug)!,
      attemptedAt: new Date(0),
    });
    await filler.fill(INPUT);
    expect(statsCalls).toEqual([1]);
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      startDate: '2017-10-03',
      startSeason: { year: 2017, season: 'fall' },
      broadcast: { day: 'tuesday', time: '18:25' },
      datesKnown: true,
    });
  });

  it('keeps the old numbers when a refresh fails, and does not retry at once', async () => {
    let fail = false;
    const { filler, store, statsCalls, advance } = setup({
      stats: async (id) => {
        if (fail) throw new MalError('boom', 500);
        return {
          id,
          score: 8,
          voters: 1,
          rank: 1,
          popularity: 1,
          members: 1,
          airing: 'finished_airing',
          episodes: 12,
          startDate: null,
          startSeason: null,
          broadcast: null,
        };
      },
    });
    await filler.fill(INPUT);
    advance(MAL_REFRESH_AFTER_MS);
    fail = true;
    await filler.fill(INPUT);
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      status: 'ok',
      score: 7.55,
    });
    await filler.fill(INPUT);
    expect(statsCalls).toEqual([]);
    advance(MAL_RETRY_AFTER_MS.failed);
    fail = false;
    await filler.fill(INPUT);
    expect(store.rows.get(INPUT.slug)?.score).toBe(8);
  });

  it('keeps the old numbers when MAL no longer knows the id', async () => {
    const { filler, store, advance } = setup({ stats: async () => null });
    await filler.fill(INPUT);
    advance(MAL_REFRESH_AFTER_MS);
    await filler.fill(INPUT);
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      status: 'ok',
      score: 7.55,
    });
  });

  it('keeps an unscored title as nulls', async () => {
    const bare: MalCandidate = candidate({
      score: null,
      voters: null,
      rank: null,
      popularity: null,
      members: null,
      airing: null,
      episodes: undefined,
    });
    const { filler, store } = setup({ search: async () => [bare] });
    await filler.fill(INPUT);
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      status: 'ok',
      score: null,
      rank: null,
    });
  });
});
