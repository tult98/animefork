import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createEpisodeSiteClient,
  EPISODE_USER_AGENT,
  MAX_RETRY_AFTER_MS,
} from '../../src/episodes/episode.client.ts';
import { createRateLimiter } from '../../src/episodes/episode.limiter.ts';

const row = (n: number) =>
  `<tr class="episode-list-data"><td class="episode-number nowrap" data-raw="${n}">${n}</td><td class="episode-title"><a href="x">Ep ${n}</a></td></tr>`;
const listPage = (count: number, from = 1) =>
  `<table class="mt8 episode_list">${Array.from({ length: count }, (_, i) => row(from + i)).join('')}</table>`;
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const header = (init: RequestInit | undefined, name: string) =>
  (init?.headers as Record<string, string>)[name];

describe('createEpisodeSiteClient', () => {
  it('reads the list page with the identifiable agent', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(listPage(1)),
    );
    const client = createEpisodeSiteClient({
      fetch,
      sleep: async () => undefined,
    });

    expect(await client.list(21)).toHaveLength(1);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://myanimelist.net/anime/21/x/episode',
    ]);
    expect(
      (fetch.mock.calls[0]?.[1]?.headers as Record<string, string>)[
        'user-agent'
      ],
    ).toBe(EPISODE_USER_AGENT);
  });

  it('retries once after a 429 and pauses the shared limiter before the retry', async () => {
    let t = 0;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response(listPage(1)));
    const times: number[] = [];
    const limiter = createRateLimiter({
      gapMs: 1000,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });
    const client = createEpisodeSiteClient({
      fetch: async (...args) => {
        times.push(t);
        return fetch(...args);
      },
      limiter,
      retryMs: 7000,
    });

    expect(await client.list(5)).toHaveLength(1);
    expect(times).toEqual([0, 7000]);
  });

  it('caps a Retry-After at 60 seconds', async () => {
    let t = 0;
    const times: number[] = [];
    const answers = [
      new Response('', { status: 429, headers: { 'retry-after': '600' } }),
      new Response(listPage(1)),
    ];
    const client = createEpisodeSiteClient({
      fetch: async () => {
        times.push(t);
        return answers.shift() ?? new Response('', { status: 500 });
      },
      limiter: createRateLimiter({
        gapMs: 1000,
        now: () => t,
        sleep: async (ms) => {
          t += ms;
        },
      }),
    });

    await client.list(1);

    expect(times).toEqual([0, MAX_RETRY_AFTER_MS]);
  });

  it('reads 100 episodes a request and walks the offset until a short page', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(listPage(100)))
      .mockResolvedValueOnce(new Response(listPage(100, 101)))
      .mockResolvedValueOnce(new Response(listPage(3, 201)));
    const client = createEpisodeSiteClient({
      fetch,
      sleep: async () => undefined,
    });

    const episodes = await client.list(21);

    expect(episodes).toHaveLength(203);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://myanimelist.net/anime/21/x/episode',
      'https://myanimelist.net/anime/21/x/episode?offset=100',
      'https://myanimelist.net/anime/21/x/episode?offset=200',
    ]);
    expect(header(fetch.mock.calls[0]?.[1], 'user-agent')).toBe(
      EPISODE_USER_AGENT,
    );
  });

  it('maps the fields of a real list page', async () => {
    const client = createEpisodeSiteClient({
      fetch: async () =>
        new Response(fixture('list-black-clover-2nd-season.html')),
      sleep: async () => undefined,
    });

    expect((await client.list(61967))?.[1]).toEqual({
      number: 2,
      title: 'The Door to Hell',
      titleAlt: 'Jigoku e no Tobira (地獄への扉)',
      aired: '2026-10-10',
    });
  });

  it('stores an empty list for a show with none listed', async () => {
    const client = createEpisodeSiteClient({
      fetch: async () => new Response(fixture('list-no-episodes.html')),
      sleep: async () => undefined,
    });
    expect(await client.list(9)).toEqual([]);
  });

  it('fails on a challenge page or a 403 instead of returning an empty list', async () => {
    const challenge = createEpisodeSiteClient({
      fetch: async () => new Response(fixture('list-challenge.html')),
      sleep: async () => undefined,
    });
    await expect(challenge.list(9)).rejects.toThrow('not the episode list');

    const forbidden = createEpisodeSiteClient({
      fetch: async () => new Response('', { status: 403 }),
      sleep: async () => undefined,
    });
    await expect(forbidden.list(9)).rejects.toThrow('answered 403');
  });

  it('gives up after the second failure', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const client = createEpisodeSiteClient({
      fetch,
      sleep: async () => undefined,
    });
    await expect(client.list(5)).rejects.toThrow('answered 503');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
