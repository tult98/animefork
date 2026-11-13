import { describe, expect, it, vi } from 'vitest';
import {
  createEpisodeSiteClient,
  EpisodeSiteError,
} from '../../src/episodes/episode.client.ts';

const limiter = { wait: async () => undefined, pause: () => undefined };

function make(answer: (url: string) => Response) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    answer(String(url)),
  );
  const client = createEpisodeSiteClient({
    baseUrl: 'https://tenrai.test/v1',
    fetch,
    limiter,
    sleep: async () => undefined,
  });
  return { client, fetch };
}

const ep = (n: number, over: Record<string, unknown> = {}) => ({
  mal_id: n,
  title: `Episode ${n}`,
  title_romanji: `Eipisōdo ${n}`,
  aired: '1999-10-20T00:00:00+00:00',
  synopsis: 'A boy wakes.\n\n(Source: Crunchyroll)',
  ...over,
});

describe('createEpisodeSiteClient', () => {
  it('reads every page and keeps the date and the synopsis without its credit', async () => {
    const { client, fetch } = make((url) =>
      Response.json({
        pagination: { has_next_page: url.endsWith('page=1') },
        data: [ep(url.endsWith('page=1') ? 1 : 2)],
      }),
    );

    expect(await client.list(21)).toEqual([
      {
        number: 1,
        title: 'Episode 1',
        titleAlt: 'Eipisōdo 1',
        aired: '1999-10-20',
        synopsis: 'A boy wakes.',
      },
      {
        number: 2,
        title: 'Episode 2',
        titleAlt: 'Eipisōdo 2',
        aired: '1999-10-20',
        synopsis: 'A boy wakes.',
      },
    ]);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://tenrai.test/v1/anime/21/episodes?page=1',
      'https://tenrai.test/v1/anime/21/episodes?page=2',
    ]);
  });

  it('stores no synopsis when Tenrai has none or only a credit', async () => {
    const { client } = make(() =>
      Response.json({
        pagination: { has_next_page: false },
        data: [
          ep(1, { synopsis: null }),
          ep(2, { synopsis: '(Source: Crunchyroll)' }),
        ],
      }),
    );

    expect((await client.list(21))?.map((e) => e.synopsis)).toEqual([
      null,
      null,
    ]);
  });

  it('answers null for an unknown entry and throws for anything that is not a list', async () => {
    const missing = make(() => new Response('', { status: 404 }));
    expect(await missing.client.list(1)).toBeNull();

    const html = make(() => new Response('<html>blocked</html>'));
    await expect(html.client.list(1)).rejects.toBeInstanceOf(EpisodeSiteError);

    const down = make(() => new Response('down', { status: 503 }));
    await expect(down.client.list(1)).rejects.toMatchObject({ status: 503 });
    expect(down.fetch).toHaveBeenCalledTimes(2);
  });
});
