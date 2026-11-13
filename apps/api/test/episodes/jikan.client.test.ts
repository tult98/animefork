import { describe, expect, it, vi } from 'vitest';
import { createJikanClient } from '../../src/episodes/jikan.client.ts';
import type { JikanLimiter } from '../../src/episodes/jikan.limiter.ts';

// Hand-built from the documented getAnimeEpisodes shape, not captured from api.jikan.moe.
const episode = (n: number, extra: Record<string, unknown> = {}) => ({
  mal_id: n,
  url: `https://myanimelist.net/anime/1/x/episode/${n}`,
  title: `Ep ${n}`,
  title_japanese: null,
  title_romanji: null,
  aired: null,
  score: null,
  filler: false,
  recap: false,
  forum_url: null,
  ...extra,
});
const body = (data: unknown[], hasNext: boolean) => ({
  pagination: { last_visible_page: 2, has_next_page: hasNext },
  data,
});

function setup(...responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const r of responses) fetch.mockResolvedValueOnce(r);
  const events: string[] = [];
  const limiter: JikanLimiter = {
    wait: async () => {
      events.push('wait');
    },
    pause: (ms) => {
      events.push(`pause ${ms}`);
    },
  };
  return {
    fetch,
    events,
    client: createJikanClient({ fetch, limiter }),
    urls: () => fetch.mock.calls.map(([url]) => String(url)),
  };
}

describe('createJikanClient (documented fixtures)', () => {
  it('makes one request per page of 100 and maps the fields', async () => {
    const first = Array.from({ length: 100 }, (_, i) => episode(i + 1));
    first[0] = episode(1, {
      title: 'The Battle Begins',
      title_romanji: 'Kaisen',
      aired: '2026-10-03T00:00:00+00:00',
    });
    const { client, urls } = setup(
      Response.json(body(first, true)),
      Response.json(
        body([episode(101, { title: null, title_japanese: '終' })], false),
      ),
    );

    const episodes = await client.list(21);

    expect(urls()).toEqual([
      'https://api.jikan.moe/v4/anime/21/episodes?page=1',
      'https://api.jikan.moe/v4/anime/21/episodes?page=2',
    ]);
    expect(episodes).toHaveLength(101);
    expect(episodes?.[0]).toEqual({
      number: 1,
      title: 'The Battle Begins',
      titleAlt: 'Kaisen',
      aired: '2026-10-03',
    });
    expect(episodes?.[100]).toEqual({
      number: 101,
      title: '終',
      titleAlt: null,
      aired: null,
    });
  });

  it('pauses the limiter for Retry-After on a 429 and retries once', async () => {
    const { client, fetch, events } = setup(
      new Response('', { status: 429, headers: { 'retry-after': '12' } }),
      Response.json(body([episode(1)], false)),
    );

    expect(await client.list(5)).toHaveLength(1);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['wait', 'pause 12000', 'wait']);
  });

  it('backs off 5s then 15s without Retry-After, then fails after two retries', async () => {
    const { client, fetch, events } = setup(
      new Response('', { status: 429 }),
      new Response('', { status: 429 }),
      new Response('', { status: 429 }),
    );

    await expect(client.list(5)).rejects.toThrow('answered 429');

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(events.filter((e) => e.startsWith('pause'))).toEqual([
      'pause 5000',
      'pause 15000',
    ]);
  });

  it('answers null for a 404 and throws for an outage', async () => {
    const { client } = setup(
      new Response('', { status: 404 }),
      new Response('', { status: 504 }),
    );
    expect(await client.list(1)).toBeNull();
    await expect(client.list(2)).rejects.toThrow('answered 504');
  });
});
