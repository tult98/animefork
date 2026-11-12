import { describe, expect, it } from 'vitest';
import {
  MalError,
  type MalCandidate,
  type MalClient,
} from '../../src/mal/mal.client.ts';
import { MalFiller } from '../../src/mal/mal.filler.ts';
import {
  MAX_JEV_CANDIDATES,
  MalJevJudge,
  type MalJudge,
} from '../../src/mal/mal.jev.ts';
import { matchMal } from '../../src/mal/mal.matcher.ts';
import { MAX_QUERIES } from '../../src/mal/mal.queries.ts';
import {
  MAL_REFRESH_AFTER_MS,
  MAL_RETRY_AFTER_MS,
} from '../../src/mal/mal.retry.ts';
import { MemoryMalStore } from '../../src/mal/mal.store.ts';
import { TEST_JEV } from '../art/tmdb/jev-mock.ts';
import { candidate, TENKEN_1, TENKEN_2, TENKEN_INPUT } from './helpers.ts';
import { fakeMalJev, type MalJevReply } from './jev-mock.ts';

const INPUT = {
  slug: 'black-clover-a1',
  name: 'Black Clover',
  year: 2017,
  episodeCount: 170,
};

function setup(over: Partial<MalClient> = {}, judge: MalJudge | null = null) {
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
      };
    },
    ...over,
  };
  const filler = new MalFiller(store, client, now, judge);
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
      datesKnown: true,
      matchedTitle: 'Black Clover',
      matchedBy: 'score',
      reason: null,
    });
    expect(store.rows.get(INPUT.slug)?.matchScore).toBeGreaterThan(0.9);
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
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      status: 'none',
      matchedBy: null,
    });
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

describe('MalFiller with Jev', () => {
  const accepting: MalJevReply = {
    choice: '53913',
    probabilities: { '53913': 0.93, '52347': 0.07 },
    confidence: 0.8,
    noul: 0.95,
  };

  const withJev = (
    reply: Parameters<typeof fakeMalJev>[0],
    over: Partial<MalClient> = {},
  ) => {
    const jev = fakeMalJev(reply);
    const judge = new MalJevJudge(jev.client, 'jev-latest', TEST_JEV);
    return { ...setup(over, judge), sent: jev.sent };
  };

  const tenken = { search: async () => [TENKEN_2, TENKEN_1] };

  type SentState = { state: { candidates: { id: number }[] } };
  const sentIds = (sent: { body: unknown }[]) =>
    sent.map((r) => (r.body as SentState).state.candidates.map((c) => c.id));

  it('never asks Jev when the score accepts, and records the score', async () => {
    const { filler, store, sent } = withJev(accepting);
    await filler.fill(INPUT);
    expect(sent).toHaveLength(0);
    expect(store.rows.get(INPUT.slug)).toMatchObject({
      status: 'ok',
      malId: 1,
      matchedBy: 'score',
    });
  });

  it('rejects TenKen II on the score alone', () => {
    expect(matchMal(TENKEN_INPUT, [TENKEN_2, TENKEN_1])).toBeNull();
  });

  it('saves TenKen II through Jev when the score rejects it', async () => {
    const { filler, store, sent } = withJev(accepting, tenken);
    await filler.fill(TENKEN_INPUT);
    expect(sent).toHaveLength(1);
    expect(store.rows.get(TENKEN_INPUT.slug)).toMatchObject({
      status: 'ok',
      malId: 53913,
      matchedTitle: 'Tensei shitara Ken deshita II',
      matchedBy: 'jev',
      matchScore: 0.93,
      airing: 'currently_airing',
      episodes: 12,
      reason: null,
      matcherVersion: 3,
    });
  });

  it('stores a no-match with the evidence when Jev rejects', async () => {
    const { filler, store } = withJev(
      {
        ...accepting,
        probabilities: { '53913': 0.62, '52347': 0.38 },
        noul: 0.71,
      },
      tenken,
    );
    await filler.fill(TENKEN_INPUT);
    expect(store.rows.get(TENKEN_INPUT.slug)).toMatchObject({
      status: 'none',
      malId: null,
      matchedBy: null,
      reason: 'jev rejected: best 53913 p=0.62 noul=0.71',
    });
  });

  it.each<[string, () => Response]>([
    ['a 401', () => Response.json({ detail: 'bad key' }, { status: 401 })],
    ['a malformed answer', () => Response.json({ answers: {} })],
    [
      'a choice that is not a candidate',
      () =>
        Response.json({
          answers: {
            match: {
              type: 'choice',
              choice: '1',
              confidence: 0.9,
              probabilities: { '1': 0.9 },
            },
            any_match: { type: 'noul', noul: 0.9 },
          },
        }),
    ],
  ])('stores failed, never none, on %s', async (_, reply) => {
    const { filler, store } = withJev(reply, tenken);
    await filler.fill(TENKEN_INPUT);
    expect(store.rows.get(TENKEN_INPUT.slug)).toMatchObject({
      status: 'failed',
      malId: null,
    });
  });

  it('keeps the old reason when Jev is off', async () => {
    const { filler, store } = setup(tenken);
    await filler.fill(TENKEN_INPUT);
    expect(store.rows.get(TENKEN_INPUT.slug)).toMatchObject({
      status: 'none',
      reason: 'no candidate cleared the match',
    });
  });

  it('does not ask Jev when no search found anything', async () => {
    const { filler, store, sent } = withJev(accepting, {
      search: async () => [],
    });
    await filler.fill(TENKEN_INPUT, async () => ['Reincarnated as a Sword']);
    expect(sent).toHaveLength(0);
    expect(store.rows.get(TENKEN_INPUT.slug)).toMatchObject({
      status: 'none',
      reason: 'no candidate cleared the match',
    });
  });

  it('asks Jev once with the candidates of every search merged, de-duplicated and capped', async () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) =>
        candidate({ id: from + i, title: `Unrelated ${from + i}`, year: 1990 }),
      );
    const results: Record<string, ReturnType<typeof page>> = {
      'tensei shitara ken deshita II': [
        candidate({ id: 900, title: 'Promo', mediaType: 'pv' }),
        TENKEN_2,
        ...page(100, 6),
      ],
      'tensei shitara ken': [TENKEN_2, TENKEN_1, ...page(103, 8)],
      'Reincarnated as a Sword': [
        candidate({ id: 901, title: 'Song', mediaType: 'music' }),
        ...page(200, 5),
      ],
      'TenKen II': page(300, 5),
    };
    const searches: string[] = [];
    const { filler, sent } = withJev(
      { ...accepting, noul: 0.5 },
      {
        search: async (q) => {
          searches.push(q);
          return results[q] ?? [];
        },
      },
    );
    await filler.fill(TENKEN_INPUT, async () => [
      'Reincarnated as a Sword',
      'TenKen II',
    ]);
    expect(searches).toContain('TenKen II');
    expect(sent).toHaveLength(1);
    const expected = [
      53913,
      ...[100, 101, 102, 103, 104, 105],
      52347,
      ...[106, 107, 108, 109, 110],
      ...[200, 201, 202, 203, 204],
      ...[300, 301],
    ];
    expect(expected).toHaveLength(MAX_JEV_CANDIDATES);
    expect(sentIds(sent)).toEqual([expected]);
  });
});
