import { describe, expect, it, vi } from 'vitest';
import {
  MAX_QUERY_LENGTH,
  MalError,
  createMalClient,
  fitQuery,
} from '../../src/mal/mal.client.ts';
import { loadMalConfig } from '../../src/mal/mal.config.ts';
import { node } from './helpers.ts';

function make(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
  extra = {},
) {
  const calls: { url: URL; headers: Headers }[] = [];
  const fetchImpl = (async (input: URL, init?: RequestInit) => {
    calls.push({ url: input, headers: new Headers(init?.headers) });
    return handler(input, init);
  }) as unknown as typeof fetch;
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const client = createMalClient({
    clientId: 'abc',
    baseUrl: 'https://mal.test/v2/',
    fetch: fetchImpl,
    gapMs: 1000,
    cooldownMs: 60_000,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...extra,
  });
  return { client, calls, sleeps, advance: (ms: number) => (clock += ms) };
}

describe('MalClient.search', () => {
  it('sends the client id and asks for the stat fields', async () => {
    const { client, calls } = make(() =>
      Response.json({ data: [{ node: node() }] }),
    );
    const [found] = await client.search('black clover');
    expect(calls[0]?.headers.get('x-mal-client-id')).toBe('abc');
    expect(calls[0]?.url.pathname).toBe('/v2/anime');
    expect(calls[0]?.url.searchParams.get('q')).toBe('black clover');
    expect(calls[0]?.url.searchParams.get('fields')).toContain(
      'num_scoring_users',
    );
    expect(found).toMatchObject({
      id: 34572,
      title: 'Black Clover',
      english: 'Black Clover',
      synonyms: ['BC'],
      year: 2017,
      episodes: 170,
      mediaType: 'tv',
      score: 7.55,
      voters: 69596,
      rank: 2006,
      popularity: 1762,
      members: 157000,
      airing: 'finished_airing',
    });
  });

  it('answers null for what MAL leaves out, and skips a node it cannot read', async () => {
    const bare = { id: 5, title: 'New Show' };
    const { client } = make(() =>
      Response.json({ data: [{ node: bare }, { node: { nonsense: true } }] }),
    );
    const found = await client.search('new show');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      score: null,
      voters: null,
      rank: null,
      popularity: null,
      members: null,
      airing: null,
      year: undefined,
      episodes: undefined,
    });
  });

  it('treats 0 episodes as unknown', async () => {
    const { client } = make(() =>
      Response.json({ data: [{ node: node({ num_episodes: 0 }) }] }),
    );
    expect((await client.search('x'))[0]?.episodes).toBeUndefined();
  });

  it('reads an airing status, and null for one it does not know', async () => {
    const { client } = make(() =>
      Response.json({
        data: [
          { node: node({ status: 'currently_airing' }) },
          { node: node({ id: 2, status: 'on_hiatus' }) },
          { node: node({ id: 3, status: undefined }) },
        ],
      }),
    );
    const found = await client.search('x');
    expect(found.map((c) => c.airing)).toEqual([
      'currently_airing',
      null,
      null,
    ]);
  });

  it('reads a start date as precise as MAL gives it, and a start season', async () => {
    const { client, calls } = make(() =>
      Response.json({
        data: [
          { node: node({ start_date: '2027' }) },
          { node: node({ id: 2, start_date: '2027-01' }) },
          { node: node({ id: 3, start_date: '2027-01-09' }) },
          {
            node: node({
              id: 4,
              start_date: undefined,
              start_season: undefined,
            }),
          },
          {
            node: node({
              id: 5,
              start_date: '2027-13',
              start_season: { year: 2027, season: 'monsoon' },
            }),
          },
          {
            node: node({
              id: 6,
              start_date: 'soon',
              start_season: { year: 2027, season: 'winter' },
            }),
          },
        ],
      }),
    );
    const found = await client.search('x');
    expect(found.map((c) => c.startDate)).toEqual([
      '2027',
      '2027-01',
      '2027-01-09',
      null,
      null,
      null,
    ]);
    expect(found.map((c) => c.startSeason)).toEqual([
      { year: 2017, season: 'fall' },
      { year: 2017, season: 'fall' },
      { year: 2017, season: 'fall' },
      null,
      null,
      { year: 2027, season: 'winter' },
    ]);
    expect(calls[0]?.url.searchParams.get('fields')).toContain('start_date');
  });

  it('reads the broadcast day and time, and keeps a day MAL has no time for', async () => {
    const { client, calls } = make(() =>
      Response.json({
        data: [
          {
            node: node({
              id: 1,
              broadcast: { day_of_the_week: 'monday', start_time: '23:30' },
            }),
          },
          {
            node: node({
              id: 2,
              broadcast: { day_of_the_week: 'friday' },
            }),
          },
          { node: node({ id: 3 }) },
          {
            node: node({
              id: 4,
              broadcast: { day_of_the_week: 'other', start_time: '23:30' },
            }),
          },
          {
            node: node({
              id: 5,
              broadcast: { day_of_the_week: 'sunday', start_time: '9:5' },
            }),
          },
        ],
      }),
    );
    const found = await client.search('x');
    expect(found.map((c) => c.broadcast)).toEqual([
      { day: 'monday', time: '23:30' },
      { day: 'friday', time: null },
      null,
      null,
      { day: 'sunday', time: null },
    ]);
    expect(calls[0]?.url.searchParams.get('fields')).toContain('broadcast');
  });

  it('throws a MalError carrying the status', async () => {
    const { client } = make(() => new Response('no', { status: 500 }));
    await expect(client.search('abc')).rejects.toMatchObject({
      name: 'MalError',
      status: 500,
    });
  });

  it('wraps a network failure', async () => {
    const { client } = make(() => {
      throw new Error('offline');
    });
    await expect(client.search('abc')).rejects.toBeInstanceOf(MalError);
  });
});

describe('MalClient.stats', () => {
  it('reads the broadcast of one id', async () => {
    const { client } = make(() =>
      Response.json(
        node({
          broadcast: { day_of_the_week: 'saturday', start_time: '01:05' },
        }),
      ),
    );
    expect((await client.stats(34572))?.broadcast).toEqual({
      day: 'saturday',
      time: '01:05',
    });
  });

  it('reads the stats of one id and asks only for them', async () => {
    const { client, calls } = make(() => Response.json(node()));
    expect(await client.stats(34572)).toEqual({
      id: 34572,
      score: 7.55,
      voters: 69596,
      rank: 2006,
      popularity: 1762,
      members: 157000,
      airing: 'finished_airing',
      episodes: 170,
      startDate: null,
      startSeason: { year: 2017, season: 'fall' },
      broadcast: null,
    });
    expect(calls[0]?.url.pathname).toBe('/v2/anime/34572');
    expect(calls[0]?.url.searchParams.get('fields')).toContain('start_date');
    expect(calls[0]?.url.searchParams.get('fields')).toContain('start_season');
    expect(calls[0]?.url.searchParams.get('fields')).toContain('broadcast');
    expect(calls[0]?.url.searchParams.get('fields')).not.toContain(
      'alternative_titles',
    );
  });

  it('answers null when MAL no longer has the id', async () => {
    const { client } = make(() => new Response('', { status: 404 }));
    expect(await client.stats(1)).toBeNull();
  });
});

describe('MalClient pacing', () => {
  it('runs calls one at a time with a gap between them', async () => {
    let running = 0;
    let peak = 0;
    const { client, sleeps } = make(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return Response.json({ data: [] });
    });
    await Promise.all([
      client.search('aaa'),
      client.search('bbb'),
      client.search('ccc'),
    ]);
    expect(peak).toBe(1);
    expect(sleeps.filter((s) => s > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('stops calling MAL for the cooldown after a 429, then resumes', async () => {
    const answer = vi.fn(() => new Response('slow down', { status: 429 }));
    const { client, advance } = make(answer);
    await expect(client.search('aaa')).rejects.toMatchObject({ status: 429 });
    await expect(client.search('bbb')).rejects.toMatchObject({ status: 429 });
    expect(answer).toHaveBeenCalledTimes(1);
    advance(60_000);
    answer.mockImplementation(() => new Response('slow down', { status: 429 }));
    await expect(client.search('ccc')).rejects.toMatchObject({ status: 429 });
    expect(answer).toHaveBeenCalledTimes(2);
  });

  it('keeps going after one call fails', async () => {
    let n = 0;
    const { client } = make(() =>
      ++n === 1
        ? new Response('no', { status: 500 })
        : Response.json({ data: [] }),
    );
    await expect(client.search('aaa')).rejects.toBeInstanceOf(MalError);
    expect(await client.search('bbb')).toEqual([]);
  });
});

describe('loadMalConfig', () => {
  it('is off without a client id', () => {
    expect(loadMalConfig({})).toBeUndefined();
    expect(loadMalConfig({ MAL_CLIENT_ID: '  ' })).toBeUndefined();
    expect(loadMalConfig({ MAL_CLIENT_ID: '' })).toBeUndefined();
  });

  it('reads the id and an optional base url', () => {
    expect(loadMalConfig({ MAL_CLIENT_ID: 'abc' })).toEqual({
      clientId: 'abc',
      baseUrl: 'https://api.myanimelist.net/v2',
    });
    expect(
      loadMalConfig({ MAL_CLIENT_ID: 'abc', MAL_API_BASE: 'https://m.test/v2' })
        ?.baseUrl,
    ).toBe('https://m.test/v2');
  });
});

describe('fitQuery', () => {
  it('leaves a query MAL accepts alone', () => {
    expect(fitQuery('Black Clover')).toBe('Black Clover');
    expect(fitQuery('a'.repeat(MAX_QUERY_LENGTH))).toHaveLength(
      MAX_QUERY_LENGTH,
    );
  });

  it('cuts a long title at a word boundary within the limit', () => {
    const long =
      'Yowaki Max Reijou nanoni Ratsuwan Konyakusha-sama no Kake ni Notte Shimatta';
    const fit = fitQuery(long);
    expect(fit.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
    expect(long.startsWith(fit)).toBe(true);
    expect(long[fit.length]).toBe(' ');
  });

  it('hard-cuts a long word with no space, and the client sends the cut query', async () => {
    expect(fitQuery('x'.repeat(100))).toHaveLength(MAX_QUERY_LENGTH);
    const { client, calls } = make(() => Response.json({ data: [] }));
    await client.search('word '.repeat(30));
    expect(calls[0]?.url.searchParams.get('q')!.length).toBeLessThanOrEqual(
      MAX_QUERY_LENGTH,
    );
  });
});
