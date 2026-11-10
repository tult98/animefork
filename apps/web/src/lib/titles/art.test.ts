// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyArt,
  applyHomeArt,
  artPollDelay,
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
const env = { VITE_API_URL: 'https://api.test/' };
const TITLE = { slug: SLUG, name: 'Tonikaku Kawaii' };

function answer(art: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    Response.json({ art }, { status }),
  ) as unknown as typeof fetch;
}

function sentBody(fetchImpl: typeof fetch, call = 0): unknown {
  const init = vi.mocked(fetchImpl).mock.calls[call]![1];
  return JSON.parse(String(init?.body));
}

describe('artPollDelay', () => {
  it('backs off 3s, 6s, 12s while pending and then stops', () => {
    expect([1, 2, 3, 4].map((n) => artPollDelay(true, n))).toEqual([
      3000,
      6000,
      12000,
      false,
    ]);
  });

  it('stops as soon as nothing is pending', () => {
    expect(artPollDelay(false, 1)).toBe(false);
    expect(artPollDelay(undefined, 0)).toBe(false);
  });
});

describe('fetchArt', () => {
  it('posts the title with episodes and builds TMDB urls from a ready entry', async () => {
    const fetchImpl = answer({
      [SLUG]: {
        status: 'ready',
        backdropPath: '/b.jpg',
        backdropLang: 'vi',
        stills: { '2': '/s2.jpg' },
      },
    });
    const art = await fetchArt(TITLE, { env, fetch: fetchImpl });
    expect(art.backdrop).toBe('https://image.tmdb.org/t/p/w1280/b.jpg');
    expect(art.stills.get(2)).toBe('https://image.tmdb.org/t/p/w300/s2.jpg');
    expect(art.pending).toBe(false);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(String(url)).toBe('https://api.test/v1/art/lookup');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    expect(sentBody(fetchImpl)).toEqual({ titles: [TITLE], episodes: true });
  });

  it('answers no art but pending while the service fills the title', async () => {
    const art = await fetchArt(TITLE, {
      env,
      fetch: answer({ [SLUG]: { status: 'pending' } }),
    });
    expect(art).toEqual({ ...NO_ART, pending: true });
  });

  it('answers no art for none', async () => {
    expect(
      await fetchArt(TITLE, {
        env,
        fetch: answer({ [SLUG]: { status: 'none' } }),
      }),
    ).toBe(NO_ART);
  });

  it('makes no request without the API url', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await fetchArt(TITLE, { env: {}, fetch: fetchImpl })).toBe(NO_ART);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves to no art on a network failure, an error status or a bad shape', async () => {
    const failing: typeof fetch = async () => {
      throw new Error('offline');
    };
    for (const fetchImpl of [
      failing,
      answer({}, 500),
      answer({ [SLUG]: { status: 'done' } }),
      (async () => Response.json([])) as unknown as typeof fetch,
    ]) {
      expect(await fetchArt(TITLE, { env, fetch: fetchImpl })).toBe(NO_ART);
    }
  });
});

describe('applyArt', () => {
  const page = parseWatchPage(html, SLUG);

  it('returns the page untouched when there is no art', () => {
    expect(applyArt(page, NO_ART)).toBe(page);
  });

  it('replaces the image and only the thumbnails that have a still', () => {
    const art: TitleArt = {
      pending: false,
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
      pending: false,
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
  const titles = [
    { slug: 'a-1', name: 'A' },
    { slug: 'b-2', name: 'B' },
    { slug: 'c-3', name: 'C' },
  ];

  it('posts every title without episodes and keeps only ready backdrops', async () => {
    const fetchImpl = answer({
      'a-1': { status: 'ready', backdropPath: '/a.jpg', backdropLang: 'en' },
      'b-2': { status: 'ready', backdropPath: null, backdropLang: null },
      'c-3': { status: 'none' },
    });
    const art = await fetchBackdrops(titles, { env, fetch: fetchImpl });
    expect([...art.backdrops]).toEqual([['a-1', '/a.jpg']]);
    expect(art.pending).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchImpl)).toEqual({ titles });
  });

  it('reports pending when any entry is still being filled', async () => {
    const art = await fetchBackdrops(titles, {
      env,
      fetch: answer({ 'a-1': { status: 'pending' } }),
    });
    expect(art).toEqual({ backdrops: new Map(), pending: true });
  });

  it('splits more than 50 titles into several lookups', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      slug: `s-${i}`,
      name: 'S',
    }));
    const fetchImpl = answer({});
    await fetchBackdrops(many, { env, fetch: fetchImpl });
    const sizes = vi
      .mocked(fetchImpl)
      .mock.calls.map(
        (_, i) =>
          (sentBody(fetchImpl, i) as { titles: unknown[] }).titles.length,
      );
    expect(sizes).toEqual([50, 50, 20]);
  });

  it('answers nothing without a base url or titles, without fetching', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const empty = { backdrops: new Map(), pending: false };
    expect(await fetchBackdrops(titles, { env: {}, fetch: fetchImpl })).toEqual(
      empty,
    );
    expect(await fetchBackdrops([], { env, fetch: fetchImpl })).toEqual(empty);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers nothing on an HTTP error, a bad body or a network failure', async () => {
    const answers = [
      async () => new Response('no', { status: 500 }),
      async () => Response.json({ not: 'a lookup' }),
      async () => {
        throw new Error('offline');
      },
    ];
    for (const a of answers) {
      const art = await fetchBackdrops(titles, {
        env,
        fetch: a as unknown as typeof fetch,
      });
      expect(art).toEqual({ backdrops: new Map(), pending: false });
    }
  });
});

describe('applyHomeArt', () => {
  const backdrops = new Map([
    ['a-1', '/a.jpg'],
    ['c-3', '/c.jpg'],
  ]);

  it('puts w1280 on the hero and w780 on the cards, and leaves the rest', () => {
    const [hero, cards] = applyHomeArt(home(), backdrops);
    expect(hero?.items.map((t) => t.image)).toEqual([
      'https://image.tmdb.org/t/p/w1280/a.jpg',
      'https://cdn.test/b-2.jpg',
    ]);
    expect(cards?.items.map((t) => t.image)).toEqual([
      'https://image.tmdb.org/t/p/w780/a.jpg',
      'https://image.tmdb.org/t/p/w780/c.jpg',
    ]);
  });

  it('adds a w780 backdrop to the ranking items and keeps their poster image', () => {
    const [, , top] = applyHomeArt(home(), backdrops);
    expect(top?.items).toEqual([
      {
        ...home()[2]!.items[0],
        backdrop: 'https://image.tmdb.org/t/p/w780/a.jpg',
      },
    ]);
    expect(top?.items[0]?.image).toBe('https://cdn.test/a-1.jpg');
  });

  it('leaves a ranking item without a stored backdrop untouched', () => {
    const [, , top] = applyHomeArt(home(), new Map([['c-3', '/c.jpg']]));
    expect(top).toEqual(home()[2]);
  });

  it('sets no backdrop field on the hero and card shelves', () => {
    const [hero, cards] = applyHomeArt(home(), backdrops);
    expect(
      [...hero!.items, ...cards!.items].some((t) => 'backdrop' in t),
    ).toBe(false);
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
