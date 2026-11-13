import { describe, expect, it, vi } from 'vitest';
import {
  createEpisodeSiteClient,
  EPISODE_USER_AGENT,
} from '../../src/episodes/episode.client.ts';

const row = (n: number) =>
  `<tr class="episode-list-data"><td class="episode-number nowrap" data-raw="${n}">${n}</td><td class="episode-title"><a href="x">Ep ${n}</a></td></tr>`;
const html = (count: number, from = 1) =>
  Array.from({ length: count }, (_, i) => row(from + i)).join('');

describe('createEpisodeSiteClient', () => {
  it('walks the list pages by offset until one is short', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(html(100)))
      .mockResolvedValueOnce(new Response(html(3, 101)));
    const client = createEpisodeSiteClient({
      fetch,
      sleep: async () => undefined,
    });

    const episodes = await client.list(21);

    expect(episodes).toHaveLength(103);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://myanimelist.net/anime/21/x/episode',
      'https://myanimelist.net/anime/21/x/episode?offset=100',
    ]);
    expect(fetch.mock.calls[0]?.[1].headers['user-agent']).toBe(
      EPISODE_USER_AGENT,
    );
  });

  it('retries once after a 429 and waits between calls', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response(html(1)));
    const client = createEpisodeSiteClient({ fetch, sleep, retryMs: 7000 });

    expect(await client.list(5)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('gives up after the second failure', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const client = createEpisodeSiteClient({
      fetch,
      sleep: async () => undefined,
    });
    await expect(client.synopsis(5, 1)).rejects.toThrow('answered 503');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
