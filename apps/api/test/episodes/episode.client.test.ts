import { describe, expect, it, vi } from 'vitest';
import {
  createEpisodeSiteClient,
  EPISODE_USER_AGENT,
} from '../../src/episodes/episode.client.ts';

const page = (text: string) => `<h2 class="fw-b">Synopsis</h2>${text}</div>`;

describe('createEpisodeSiteClient', () => {
  it('reads one episode page with the identifiable agent', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(page('A door opens.')),
    );
    const client = createEpisodeSiteClient({
      fetch,
      sleep: async () => undefined,
    });

    expect(await client.synopsis(21, 3)).toBe('A door opens.');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://myanimelist.net/anime/21/x/episode/3',
    ]);
    expect(
      (fetch.mock.calls[0]?.[1]?.headers as Record<string, string>)[
        'user-agent'
      ],
    ).toBe(EPISODE_USER_AGENT);
  });

  it('retries once after a 429 and waits between calls', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response(page('A door opens.')));
    const client = createEpisodeSiteClient({ fetch, sleep, retryMs: 7000 });

    expect(await client.synopsis(5, 1)).toBe('A door opens.');
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
