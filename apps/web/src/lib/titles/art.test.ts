// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  MalStats,
  TitleRatings,
} from '../../../../api/src/art/contract.ts';
import {
  applyArt,
  applyHomeArt,
  applyRatings,
  artPollDelay,
  fetchArt,
  fetchHomeArt,
  type HomeArtPaths,
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
        posterPath: null,
        stills: { '2': '/s2.jpg' },
      },
    });
    const art = await fetchArt(TITLE, { env, fetch: fetchImpl });
    expect(art.backdrop).toBe('https://image.tmdb.org/t/p/original/b.jpg');
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
      backdrop: 'https://image.tmdb.org/t/p/original/b.jpg',
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

describe('fetchHomeArt', () => {
  const titles = [
    { slug: 'a-1', name: 'A' },
    { slug: 'b-2', name: 'B' },
    { slug: 'c-3', name: 'C' },
  ];

  it('posts every title without episodes and keeps only entries with a backdrop or a poster', async () => {
    const fetchImpl = answer({
      'a-1': {
        status: 'ready',
        backdropPath: '/a.jpg',
        backdropLang: 'en',
        posterPath: '/pa.jpg',
      },
      'b-2': {
        status: 'ready',
        backdropPath: null,
        backdropLang: null,
        posterPath: null,
      },
      'c-3': {
        status: 'ready',
        backdropPath: null,
        backdropLang: null,
        posterPath: '/pc.jpg',
      },
    });
    const art = await fetchHomeArt(titles, { env, fetch: fetchImpl });
    expect([...art.paths]).toEqual([
      [
        'a-1',
        { backdropPath: '/a.jpg', posterPath: '/pa.jpg', overview: null },
      ],
      ['c-3', { backdropPath: null, posterPath: '/pc.jpg', overview: null }],
    ]);
    expect(art.pending).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchImpl)).toEqual({ titles });
  });

  it('carries the overview, and keeps an entry that has only an overview', async () => {
    const art = await fetchHomeArt(titles, {
      env,
      fetch: answer({
        'a-1': {
          status: 'ready',
          backdropPath: '/a.jpg',
          backdropLang: 'en',
          posterPath: null,
          overview: 'Tóm tắt A.',
          overviewTranslated: false,
        },
        'b-2': {
          status: 'ready',
          backdropPath: null,
          backdropLang: null,
          posterPath: null,
          overview: 'Tóm tắt B.',
          overviewTranslated: true,
        },
        'c-3': {
          status: 'ready',
          backdropPath: '/c.jpg',
          backdropLang: 'en',
          posterPath: null,
          overview: null,
          overviewTranslated: false,
        },
      }),
    });
    expect([...art.paths]).toEqual([
      [
        'a-1',
        { backdropPath: '/a.jpg', posterPath: null, overview: 'Tóm tắt A.' },
      ],
      ['b-2', { backdropPath: null, posterPath: null, overview: 'Tóm tắt B.' }],
      ['c-3', { backdropPath: '/c.jpg', posterPath: null, overview: null }],
    ]);
  });

  it('reports pending when any entry is still being filled', async () => {
    const art = await fetchHomeArt(titles, {
      env,
      fetch: answer({ 'a-1': { status: 'pending' } }),
    });
    expect(art).toEqual({
      paths: new Map(),
      ratings: new Map(),
      avsStale: [],
      pending: true,
    });
  });

  it('splits more than 50 titles into several lookups', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      slug: `s-${i}`,
      name: 'S',
    }));
    const fetchImpl = answer({});
    await fetchHomeArt(many, { env, fetch: fetchImpl });
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
    const empty = {
      paths: new Map(),
      ratings: new Map(),
      avsStale: [],
      pending: false,
    };
    expect(await fetchHomeArt(titles, { env: {}, fetch: fetchImpl })).toEqual(
      empty,
    );
    expect(await fetchHomeArt([], { env, fetch: fetchImpl })).toEqual(empty);
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
      const art = await fetchHomeArt(titles, {
        env,
        fetch: a as unknown as typeof fetch,
      });
      expect(art).toEqual({
        paths: new Map(),
        ratings: new Map(),
        avsStale: [],
        pending: false,
      });
    }
  });
});

describe('applyHomeArt', () => {
  const art = new Map<string, HomeArtPaths>([
    ['a-1', { backdropPath: '/a.jpg', posterPath: '/pa.jpg', overview: null }],
    ['c-3', { backdropPath: '/c.jpg', posterPath: null, overview: null }],
  ]);

  it('puts the original size on the hero and w780 on the cards, and leaves the rest', () => {
    const [hero, cards] = applyHomeArt(home(), art);
    expect(hero?.items.map((t) => t.image)).toEqual([
      'https://image.tmdb.org/t/p/original/a.jpg',
      'https://cdn.test/b-2.jpg',
    ]);
    expect(cards?.items.map((t) => t.image)).toEqual([
      'https://image.tmdb.org/t/p/w780/a.jpg',
      'https://image.tmdb.org/t/p/w780/c.jpg',
    ]);
  });

  it('gives a ranking item the w342 TMDB poster and a w780 backdrop for the hover', () => {
    const [, , top] = applyHomeArt(home(), art);
    expect(top?.items).toEqual([
      {
        ...home()[2]!.items[0],
        image: 'https://image.tmdb.org/t/p/w342/pa.jpg',
        backdrop: 'https://image.tmdb.org/t/p/w780/a.jpg',
      },
    ]);
  });

  it('keeps the source poster of a ranking item without a stored posterPath', () => {
    const shelves = home();
    const top = shelves[2]!;
    if (top.kind !== 'top10') throw new Error('expected the top10 shelf');
    top.items = [{ ...top.items[0]!, path: '/phim/c-3/' }];
    const [, , out] = applyHomeArt(shelves, art);
    expect(out?.items[0]).toMatchObject({
      image: 'https://cdn.test/a-1.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/c.jpg',
    });
  });

  it('sets a poster without a backdrop when only the poster is stored', () => {
    const [, , top] = applyHomeArt(
      home(),
      new Map([
        ['a-1', { backdropPath: null, posterPath: '/pa.jpg', overview: null }],
      ]),
    );
    expect(top?.items[0]).toMatchObject({
      image: 'https://image.tmdb.org/t/p/w342/pa.jpg',
    });
    expect(top?.items[0]).not.toHaveProperty('backdrop');
  });

  it('leaves a ranking item without stored art untouched', () => {
    const [, , top] = applyHomeArt(home(), new Map([['c-3', art.get('c-3')!]]));
    expect(top).toEqual(home()[2]);
  });

  it('ignores the poster on the hero and card shelves and sets no backdrop field', () => {
    const [hero, cards] = applyHomeArt(home(), art);
    expect([...hero!.items, ...cards!.items].some((t) => 'backdrop' in t)).toBe(
      false,
    );
    expect(hero?.items[0]?.image).not.toContain('w342');
  });

  describe('overview', () => {
    const withExcerpts = (): HomeShelves =>
      home().map((shelf) => ({
        ...shelf,
        items: shelf.items.map((t) => ({
          ...t,
          description: `Trích đoạn ${t.name}...`,
        })),
      })) as HomeShelves;
    const overviews = new Map<string, HomeArtPaths>([
      ['a-1', { backdropPath: null, posterPath: null, overview: 'Tóm tắt A.' }],
      ['b-2', { backdropPath: '/b.jpg', posterPath: null, overview: null }],
    ]);

    it('replaces the description of a hero item with its overview', () => {
      const [hero] = applyHomeArt(withExcerpts(), overviews);
      expect(hero?.items.map((t) => t.description)).toEqual([
        'Tóm tắt A.',
        'Trích đoạn B...',
      ]);
      expect(hero?.items[0]?.image).toBe('https://cdn.test/a-1.jpg');
      expect(hero?.items[1]?.image).toBe(
        'https://image.tmdb.org/t/p/original/b.jpg',
      );
    });

    it('replaces the excerpt on cards and ranking items that have an overview, and keeps the rest', () => {
      const [, cards, top] = applyHomeArt(withExcerpts(), overviews);
      expect(cards?.items.map((t) => t.description)).toEqual([
        'Tóm tắt A.',
        'Trích đoạn C...',
      ]);
      expect(top?.items[0]?.description).toBe('Tóm tắt A.');
    });

    it('sets an overview on a hero item that had no excerpt', () => {
      const [hero] = applyHomeArt(home(), overviews);
      expect(hero?.items[0]?.description).toBe('Tóm tắt A.');
      expect(hero?.items[1]).not.toHaveProperty('description');
    });
  });

  it('returns the same shelves when no art exists', () => {
    const shelves = home();
    expect(applyHomeArt(shelves, new Map())).toBe(shelves);
  });

  it('does not mutate its input', () => {
    const shelves = home();
    applyHomeArt(shelves, art);
    expect(shelves).toEqual(home());
  });
});

describe('ratings in a lookup', () => {
  const titles = [{ slug: 'a-1', name: 'A' }];

  it('carries the API ratings and the stale slugs through fetchHomeArt', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        art: { 'a-1': { status: 'none' } },
        ratings: {
          'a-1': { avs: { score: 8.2, voters: 1284 }, quality: 'HD' },
        },
        avsStale: ['b-2'],
      }),
    ) as unknown as typeof fetch;
    const art = await fetchHomeArt(titles, { env, fetch: fetchImpl });
    expect(art.ratings.get('a-1')).toEqual({
      avs: { score: 8.2, voters: 1284 },
      quality: 'HD',
    });
    expect(art.avsStale).toEqual(['b-2']);
  });
});

describe('MAL ratings in a lookup', () => {
  const titles = [{ slug: 'a-1', name: 'A' }];
  const mal = {
    id: 1,
    score: 7.55,
    voters: 69596,
    rank: 2006,
    popularity: 1762,
    members: 157000,
    airing: 'currently_airing' as const,
    episodes: 12,
    startDate: '2027-01',
    startSeason: { year: 2027, season: 'winter' as const },
  };
  const answer = (body: object) =>
    vi.fn(async () => Response.json(body)) as unknown as typeof fetch;

  it('carries the MAL numbers, nulls included, through fetchHomeArt', async () => {
    const art = await fetchHomeArt(titles, {
      env,
      fetch: answer({
        art: { 'a-1': { status: 'none' } },
        ratings: { 'a-1': { mal: { ...mal, rank: null } } },
      }),
    });
    expect(art.ratings.get('a-1')?.mal).toEqual({ ...mal, rank: null });
    expect(art.pending).toBe(false);
  });

  it('reads an answer from before start dates were stored as unknown dates', async () => {
    const old: Record<string, unknown> = { ...mal };
    delete old.startDate;
    delete old.startSeason;
    const art = await fetchHomeArt(titles, {
      env,
      fetch: answer({
        art: { 'a-1': { status: 'none' } },
        ratings: { 'a-1': { mal: old } },
      }),
    });
    expect(art.ratings.get('a-1')?.mal).toEqual({
      ...old,
      startDate: null,
      startSeason: null,
    });
  });

  it('polls again while the API is still filling MAL, as for pending art', async () => {
    const art = await fetchHomeArt(titles, {
      env,
      fetch: answer({
        art: { 'a-1': { status: 'none' } },
        ratingsPending: true,
      }),
    });
    expect(art.pending).toBe(true);
  });

  it('puts the MAL numbers on the title', () => {
    const title: Title = {
      path: '/phim/a-1/',
      name: 'A',
      image: 'i.jpg',
      rating: 8,
      episodeLabel: 'Tập 1',
      genres: [],
    };
    const shelves = [
      { kind: 'default', id: 'x', items: [title] },
    ] as unknown as HomeShelves;
    const out = applyRatings(shelves, new Map([['a-1', { mal }]]));
    expect(out[0]!.items[0]).toMatchObject({ mal });
  });
});

describe('applyRatings', () => {
  const card = (path: string, quality?: string): Title => ({
    path,
    name: path,
    image: 'i.jpg',
    rating: 8,
    episodeLabel: 'Tập 1',
    genres: [],
    ...(quality && { quality }),
  });
  const shelves = [
    {
      kind: 'default',
      id: 'x',
      items: [card('/phim/a-1/'), card('/phim/b-2/', 'FHD')],
    },
  ] as unknown as HomeShelves;
  const items = (s: HomeShelves) => s[0]!.items;

  it('adds the voter count and a missing quality, never replacing a card quality', () => {
    const out = applyRatings(
      shelves,
      new Map([
        ['a-1', { avs: { score: 8.2, voters: 1284 }, quality: 'HD' }],
        ['b-2', { quality: 'HD' }],
      ]),
    );
    expect(items(out)[0]).toMatchObject({ avsVoters: 1284, quality: 'HD' });
    expect(items(out)[1]).toMatchObject({ quality: 'FHD' });
    expect(items(out)[1]).not.toHaveProperty('avsVoters');
  });

  it('keeps the count read from the card over the API one', () => {
    const withCount = [
      { ...shelves[0]!, items: [{ ...card('/phim/a-1/'), avsVoters: 1300 }] },
    ] as unknown as HomeShelves;
    const out = applyRatings(
      withCount,
      new Map([['a-1', { avs: { score: 7, voters: 10 } }]]),
    );
    expect(items(out)[0]).toMatchObject({ avsVoters: 1300 });
  });

  it('returns the same shelves when there is nothing to apply', () => {
    expect(applyRatings(shelves, new Map())).toBe(shelves);
  });
});

describe('applyRatings on the upcoming shelf', () => {
  const NOW = Date.UTC(2026, 10, 11);
  const upcoming = (n: number, year: number): Title => ({
    path: `/phim/u${n}-a${n}/`,
    name: `U${n}`,
    image: 'i.jpg',
    rating: 0,
    episodeLabel: 'PV/??',
    genres: [],
    year,
  });
  const malOf = (over: Partial<MalStats>): TitleRatings => ({
    mal: {
      id: 1,
      score: null,
      voters: null,
      rank: null,
      popularity: null,
      members: null,
      airing: 'not_yet_aired',
      episodes: null,
      startDate: null,
      startSeason: null,
      ...over,
    },
  });
  const shelf = (items: Title[]) =>
    [
      { kind: 'default', id: 'upcoming', title: 'Sắp ra mắt', items },
    ] as HomeShelves;
  const built = shelf([
    upcoming(1, 2027),
    upcoming(2, 2027),
    upcoming(3, 2027),
    upcoming(4, 2027),
  ]);
  const order = (out: HomeShelves) => out[0]?.items.map((t) => t.name);

  it('sorts by the earliest instant MAL allows, and keeps page order on a tie', () => {
    const out = applyRatings(
      built,
      new Map([
        ['u3-a3', malOf({ startDate: '2027-01' })],
        ['u4-a4', malOf({ startSeason: { year: 2027, season: 'fall' } })],
        ['u1-a1', malOf({ startDate: '2026-12-25' })],
      ]),
      NOW,
    );
    expect(order(out)).toEqual(['U1', 'U2', 'U3', 'U4']);
  });

  it('moves a later-dated title behind year-only ones', () => {
    const out = applyRatings(
      built,
      new Map([['u1-a1', malOf({ startDate: '2027-09' })]]),
      NOW,
    );
    expect(order(out)).toEqual(['U2', 'U3', 'U4', 'U1']);
  });

  it('drops a title MAL says already came out, and the shelf when under three remain', () => {
    const gone = malOf({ startDate: '2026-03-01' });
    const one = applyRatings(built, new Map([['u1-a1', gone]]), NOW);
    expect(order(one)).toEqual(['U2', 'U3', 'U4']);
    const two = applyRatings(
      built,
      new Map([
        ['u1-a1', gone],
        ['u2-a2', gone],
      ]),
      NOW,
    );
    expect(two).toEqual([]);
  });

  it('leaves other shelves in their order', () => {
    const other = [
      {
        kind: 'default',
        id: 'new-episodes',
        title: 'x',
        items: [upcoming(2, 2027), upcoming(1, 2027)],
      },
    ] as unknown as HomeShelves;
    const out = applyRatings(
      other,
      new Map([['u1-a1', malOf({ startDate: '2026-12-25' })]]),
      NOW,
    );
    expect(order(out)).toEqual(['U2', 'U1']);
  });
});
