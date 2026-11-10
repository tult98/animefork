// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyArt,
  applyHomeArt,
  backdropSlugs,
  fetchArt,
  fetchBackdrops,
  NO_ART,
  type TitleArt,
} from './art.ts';
import type { HomeShelves } from './shelves.ts';
import type { Title } from './title.ts';
import { parseWatchPage } from './watch.ts';

const SLUG = 'tonikaku-kawaii-a3860';
const html = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../public/fixtures/default/phim/tonikaku-kawaii-a3860/xem-phim.html',
  ),
  'utf8',
);
const env = { VITE_ART_API_URL: 'https://db.test/' };

function respond(titles: unknown, episodes: unknown): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes('/title_art?')
      ? Response.json(titles)
      : Response.json(episodes),
  ) as unknown as typeof fetch;
}

describe('fetchArt', () => {
  it('asks PostgREST for the slug anonymously and builds TMDB urls', async () => {
    const fetchImpl = respond(
      [
        {
          source_slug: SLUG,
          tmdb_id: 1,
          tmdb_season: 1,
          backdrop_path: '/b.jpg',
          backdrop_lang: 'vi',
        },
      ],
      [{ source_slug: SLUG, episode_number: 2, still_path: '/s2.jpg' }],
    );
    const art = await fetchArt(SLUG, { env, fetch: fetchImpl });
    expect(art.backdrop).toBe('https://image.tmdb.org/t/p/w1280/b.jpg');
    expect(art.stills.get(2)).toBe('https://image.tmdb.org/t/p/w300/s2.jpg');
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(String(url)).toMatch(
      /^https:\/\/db\.test\/title_art\?source_slug=eq\.tonikaku-kawaii-a3860&select=/,
    );
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
  });

  it('sends the authorization header only when a key is set', async () => {
    const fetchImpl = respond([], []);
    await fetchArt(SLUG, {
      env: { ...env, VITE_ART_API_KEY: 'secret' },
      fetch: fetchImpl,
    });
    const [, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer secret',
    );
  });

  it('makes no request without the API url', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    for (const partial of [{}, { VITE_ART_API_KEY: 'secret' }]) {
      expect(await fetchArt(SLUG, { env: partial, fetch: fetchImpl })).toBe(
        NO_ART,
      );
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves to no art when the request fails, answers an error or throws', async () => {
    const failing: typeof fetch = async () => {
      throw new Error('offline');
    };
    const server: typeof fetch = async () =>
      new Response('{}', { status: 500 });
    expect(await fetchArt(SLUG, { env, fetch: failing })).toBe(NO_ART);
    expect(await fetchArt(SLUG, { env, fetch: server })).toBe(NO_ART);
  });

  it('drops rows that fail validation and keeps the rest', async () => {
    const art = await fetchArt(SLUG, {
      env,
      fetch: respond(
        [{ nonsense: true }],
        [
          { source_slug: SLUG, episode_number: 0, still_path: '/bad.jpg' },
          { source_slug: SLUG, episode_number: 3, still_path: '/ok.jpg' },
        ],
      ),
    });
    expect(art.backdrop).toBeUndefined();
    expect([...art.stills.keys()]).toEqual([3]);
  });
});

describe('applyArt', () => {
  const page = parseWatchPage(html, SLUG);

  it('returns the page untouched when there is no art', () => {
    expect(applyArt(page, NO_ART)).toBe(page);
  });

  it('replaces the image and only the thumbnails that have a still', () => {
    const art: TitleArt = {
      backdrop: 'https://image.tmdb.org/t/p/w1280/b.jpg',
      stills: new Map([
        [1, 'https://image.tmdb.org/t/p/w300/e1.jpg'],
        [3, 'https://image.tmdb.org/t/p/w300/e3.jpg'],
      ]),
    };
    const out = applyArt(page, art);
    expect(out.image).toBe(art.backdrop);
    expect(out.episodes.map((e) => e.thumbnail)).toEqual([
      'https://image.tmdb.org/t/p/w300/e1.jpg',
      undefined,
      'https://image.tmdb.org/t/p/w300/e3.jpg',
      undefined,
      undefined,
    ]);
    expect(out.currentEpisode.thumbnail).toBe(
      'https://image.tmdb.org/t/p/w300/e1.jpg',
    );
  });

  it('keeps the source image when the title has stills but no backdrop', () => {
    const out = applyArt(page, {
      stills: new Map([[2, 'https://image.tmdb.org/t/p/w300/e2.jpg']]),
    });
    expect(out.image).toBe(page.image);
    expect(out.episodes[1]?.thumbnail).toBe(
      'https://image.tmdb.org/t/p/w300/e2.jpg',
    );
  });
});

const home = (): HomeShelves => {
  const t = (name: string, slug: string): Title => ({
    path: `/phim/${slug}/`,
    name,
    image: `https://cdn.test/${slug}.jpg`,
    rating: 8,
    episodeLabel: 'Tập 1',
    genres: [],
  });
  return [
    { kind: 'hero', id: 'hero', items: [t('A', 'a-1'), t('B', 'b-2')] },
    {
      kind: 'default',
      id: 'new-episodes',
      title: 'New',
      items: [t('A', 'a-1'), t('C', 'c-3')],
    },
    {
      kind: 'top10',
      id: 'top-10-today',
      title: 'Top',
      items: [{ ...t('A', 'a-1'), rank: 1 }],
    },
  ];
};

describe('fetchBackdrops', () => {
  const rows = [
    { source_slug: 'a-1', backdrop_path: '/a.jpg' },
    { source_slug: 'b-2', backdrop_path: null },
    { source_slug: 'c-3', backdrop_path: '' },
    { source_slug: 7 },
  ];

  it('asks once for every slug, quoted, and keeps only usable rows', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(rows),
    ) as unknown as typeof fetch;
    const map = await fetchBackdrops(['a-1', 'b-2', 'we"ird,(slug)'], {
      env,
      fetch: fetchImpl,
    });
    expect([...map]).toEqual([['a-1', '/a.jpg']]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = String(vi.mocked(fetchImpl).mock.calls[0]![0]);
    expect(url).toMatch(/^https:\/\/db\.test\/title_art\?source_slug=in\./);
    expect(url).toContain('&select=source_slug,backdrop_path');
    const list = decodeURIComponent(
      new URL(url).searchParams.get('source_slug') ?? '',
    );
    expect(list).toBe('in.("a-1","b-2","we\\"ird,(slug)")');
  });

  it('sends the authorization header only when a key is set', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([]),
    ) as unknown as typeof fetch;
    await fetchBackdrops(['a'], {
      env: { ...env, VITE_ART_API_KEY: 'k' },
      fetch: fetchImpl,
    });
    const init = vi.mocked(fetchImpl).mock.calls[0]![1];
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer k');
  });

  it('answers nothing without a base url or slugs, without fetching', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await fetchBackdrops(['a'], { env: {}, fetch: fetchImpl })).toEqual(
      new Map(),
    );
    expect(await fetchBackdrops([], { env, fetch: fetchImpl })).toEqual(
      new Map(),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers nothing on an HTTP error, a bad body or a network failure', async () => {
    const answers = [
      async () => new Response('no', { status: 500 }),
      async () => Response.json({ not: 'a list' }),
      async () => {
        throw new Error('offline');
      },
    ];
    for (const answer of answers) {
      const map = await fetchBackdrops(['a'], {
        env,
        fetch: answer as unknown as typeof fetch,
      });
      expect(map.size).toBe(0);
    }
  });
});

describe('applyHomeArt', () => {
  const backdrops = new Map([
    ['a-1', '/a.jpg'],
    ['c-3', '/c.jpg'],
  ]);

  it('lists the slugs of the hero and card shelves once, not the ranking row', () => {
    expect(backdropSlugs(home())).toEqual(['a-1', 'b-2', 'c-3']);
  });

  it('puts w1280 on the hero and w780 on the cards, and leaves the rest', () => {
    const [hero, cards, top] = applyHomeArt(home(), backdrops);
    expect(hero?.items.map((t) => t.image)).toEqual([
      'https://image.tmdb.org/t/p/w1280/a.jpg',
      'https://cdn.test/b-2.jpg',
    ]);
    expect(cards?.items.map((t) => t.image)).toEqual([
      'https://image.tmdb.org/t/p/w780/a.jpg',
      'https://image.tmdb.org/t/p/w780/c.jpg',
    ]);
    expect(top).toEqual(home()[2]);
  });

  it('returns the same shelves when no art exists', () => {
    const shelves = home();
    expect(applyHomeArt(shelves, new Map())).toBe(shelves);
  });

  it('does not mutate its input', () => {
    const shelves = home();
    applyHomeArt(shelves, backdrops);
    expect(shelves).toEqual(home());
  });
});
