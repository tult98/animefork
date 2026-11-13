import { describe, expect, it } from 'vitest';
import { createTrailerClient } from '../../src/mal/trailer.client.ts';

function make(handler: () => Response | Promise<Response>) {
  const urls: string[] = [];
  const client = createTrailerClient({
    baseUrl: 'https://tenrai.test/v1/',
    fetch: (async (url: string) => {
      urls.push(url);
      return handler();
    }) as unknown as typeof fetch,
  });
  return { client, urls };
}

describe('TrailerClient.youtubeId', () => {
  it('asks the full record of the MAL id and returns the trailer id', async () => {
    const { client, urls } = make(() =>
      Response.json({ data: { trailer: { youtube_id: 'abc123' } } }),
    );
    expect(await client.youtubeId(34572)).toBe('abc123');
    expect(urls).toEqual(['https://tenrai.test/v1/anime/34572/full']);
  });

  it('answers null when the title has no trailer', async () => {
    const { client } = make(() =>
      Response.json({ data: { trailer: { youtube_id: null } } }),
    );
    expect(await client.youtubeId(1)).toBeNull();
  });

  it('answers undefined instead of throwing when Tenrai cannot be reached or errors', async () => {
    const down = make(() => {
      throw new TypeError('fetch failed');
    });
    expect(await down.client.youtubeId(1)).toBeUndefined();
    const broken = make(() => new Response('nope', { status: 503 }));
    expect(await broken.client.youtubeId(1)).toBeUndefined();
  });
});
