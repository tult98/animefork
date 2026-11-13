// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { MOCK_WATCH_SLUG, mockWatchHtml } from '../__mockData__/index.ts';
import {
  applyArt,
  applyHomeArt,
  applyRatings,
  artPollDelay,
  fetchArt,
  fetchHomeArt,
  markArtPending,
  NO_ART,
} from '../art.ts';
import type { TitleShelf } from '../shelves.ts';
import type { Title } from '../title.ts';
import { parseWatchPage } from '../watch.ts';

const env = { VITE_API_URL: 'https://api.test/' };

const title = (slug: string, year?: number): Title => ({
  path: `/phim/${slug}/`,
  name: slug.toUpperCase(),
  image: `https://cdn.test/${slug}.jpg`,
  rating: 8,
  episodeLabel: 'Tập 1',
  genres: [],
  ...(year && { year }),
});

describe('the art of a watch page', () => {
  it('puts the backdrop on the page', async () => {
    fetchMock.post('path:/v1/art/lookup', {
      art: {
        'tonikaku-kawaii-a3860': {
          status: 'ready',
          backdropPath: '/b.jpg',
          backdropLang: 'vi',
          posterPath: null,
        },
      },
    });
    const page = parseWatchPage(mockWatchHtml, MOCK_WATCH_SLUG);

    const art = await fetchArt(
      { slug: MOCK_WATCH_SLUG, name: 'Tonikaku Kawaii' },
      { env },
    );
    const shown = applyArt(page, art);

    expect(fetchMock).toHavePosted('https://api.test/v1/art/lookup', {
      body: {
        titles: [{ slug: MOCK_WATCH_SLUG, name: 'Tonikaku Kawaii' }],
      },
    });
    expect(shown.image).toBe('https://image.tmdb.org/t/p/original/b.jpg');
  });

  it('keeps the source page when the lookup fails', async () => {
    fetchMock.post('path:/v1/art/lookup', 500);
    const page = parseWatchPage(mockWatchHtml, MOCK_WATCH_SLUG);

    const art = await fetchArt({ slug: MOCK_WATCH_SLUG, name: 'T' }, { env });

    expect(art).toBe(NO_ART);
    expect(applyArt(page, art)).toBe(page);
  });

  it('asks again with a growing delay while the title is pending, then stops', async () => {
    fetchMock.post('path:/v1/art/lookup', {
      art: { 'a-1': { status: 'pending' } },
    });

    const art = await fetchArt({ slug: 'a-1', name: 'A' }, { env });

    expect(art).toEqual({ ...NO_ART, pending: true });
    expect([1, 2, 3, 4].map((n) => artPollDelay(art.pending, n))).toEqual([
      3000,
      6000,
      12000,
      false,
    ]);
    expect(artPollDelay(false, 1)).toBe(false);
  });

  it('sends nothing when the API is not configured', async () => {
    const art = await fetchArt({ slug: 'a-1', name: 'A' }, { env: {} });

    expect(art).toBe(NO_ART);
    expect(fetchMock).not.toHaveFetched();
  });
});

describe('the art of the home page', () => {
  const shelves: TitleShelf[] = [
    { kind: 'hero', id: 'hero', items: [title('a-1'), title('b-2')] },
    {
      kind: 'default',
      id: 'new-episodes',
      title: 'New',
      items: [title('a-1'), title('c-3')],
    },
    {
      kind: 'top10',
      id: 'top-10-today',
      title: 'Top',
      items: [{ ...title('a-1'), rank: 1 }],
    },
  ];

  it('sends the titles in chunks of 50 and shows the art that came back', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      slug: `s-${i}`,
      name: 'S',
    }));
    fetchMock.post('path:/v1/art/lookup', {
      art: {
        'a-1': {
          status: 'ready',
          backdropPath: '/a.jpg',
          backdropLang: 'en',
          posterPath: '/pa.jpg',
          overview: 'Tóm tắt A.',
        },
        'c-3': {
          status: 'ready',
          backdropPath: null,
          backdropLang: null,
          posterPath: null,
        },
      },
    });

    const art = await fetchHomeArt(many, { env });

    expect(fetchMock).toHaveFetchedTimes(3, 'path:/v1/art/lookup');
    expect(fetchMock).toHaveNthPosted(1, 'path:/v1/art/lookup', {
      body: { titles: many.slice(0, 50) },
    });
    expect(fetchMock).toHaveNthPosted(3, 'path:/v1/art/lookup', {
      body: { titles: many.slice(100) },
    });
    // An entry with no image and no overview adds nothing.
    expect([...art.paths.keys()]).toEqual(['a-1']);

    const [hero, cards, top] = applyHomeArt(shelves, art.paths);
    expect(hero?.items.map((t) => t.image)).toEqual([
      'https://image.tmdb.org/t/p/original/a.jpg',
      'https://cdn.test/b-2.jpg',
    ]);
    expect(hero?.items[0]).toHaveProperty('description', 'Tóm tắt A.');
    expect(cards?.items.map((t) => t.image)).toEqual([
      'https://image.tmdb.org/t/p/w780/a.jpg',
      'https://cdn.test/c-3.jpg',
    ]);
    expect(top?.items[0]).toMatchObject({
      image: 'https://image.tmdb.org/t/p/w342/pa.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/a.jpg',
    });
  });

  it('keeps the source images and stops the skeletons when the lookup fails', async () => {
    fetchMock.post('path:/v1/art/lookup', 500);

    const art = await fetchHomeArt(
      [
        { slug: 'a-1', name: 'A' },
        { slug: 'b-2', name: 'B' },
        { slug: 'c-3', name: 'C' },
      ],
      { env },
    );

    expect(art.paths.size).toBe(0);
    expect(applyHomeArt(shelves, art.paths)).toBe(shelves);
    const marked = markArtPending(shelves, {
      apiOn: true,
      art,
      pollsLeft: true,
    });
    expect(marked.flatMap((s) => s.items).some((t) => t.artPending)).toBe(
      false,
    );
  });

  it('keeps the skeleton only on the titles still pending, until the polls run out', async () => {
    fetchMock.post('path:/v1/art/lookup', {
      art: {
        'a-1': { status: 'none' },
        'b-2': { status: 'pending' },
        'c-3': { status: 'none' },
      },
    });
    const sent = [
      { slug: 'a-1', name: 'A' },
      { slug: 'b-2', name: 'B' },
      { slug: 'c-3', name: 'C' },
    ];
    const pendingOf = (wait: Parameters<typeof markArtPending>[1]) =>
      markArtPending(shelves, wait)
        .flatMap((s) => s.items)
        .filter((t) => t.artPending)
        .map((t) => t.name);

    const art = await fetchHomeArt(sent, { env });

    expect(art.pending).toBe(true);
    expect(pendingOf({ apiOn: true, art: undefined, pollsLeft: true })).toEqual(
      ['A-1', 'B-2', 'A-1', 'C-3', 'A-1'],
    );
    expect(pendingOf({ apiOn: true, art, pollsLeft: true })).toEqual(['B-2']);
    expect(pendingOf({ apiOn: true, art, pollsLeft: false })).toEqual([]);
  });

  it('stops waiting when the lookup takes longer than 3 seconds', async () => {
    fetchMock.post(
      'path:/v1/art/lookup',
      { art: { 'a-1': { status: 'none' } } },
      { delay: 3500 },
    );

    const art = await fetchHomeArt([{ slug: 'a-1', name: 'A' }], { env });

    expect(art.paths.size).toBe(0);
    expect(art.answered).toEqual(new Set(['a-1']));
    expect(art.pending).toBe(false);
  });

  it('carries the ratings and the stale slugs, and polls again while MAL is filling', async () => {
    fetchMock.post('path:/v1/art/lookup', {
      art: { 'a-1': { status: 'none' } },
      ratings: { 'a-1': { avs: { score: 8.2, voters: 1284 }, quality: 'HD' } },
      avsStale: ['b-2'],
      ratingsPending: true,
    });

    const art = await fetchHomeArt([{ slug: 'a-1', name: 'A' }], { env });

    expect(art.ratings.get('a-1')).toEqual({
      avs: { score: 8.2, voters: 1284 },
      quality: 'HD',
    });
    expect(art.avsStale).toEqual(['b-2']);
    expect(art.pending).toBe(true);

    const [hero] = applyRatings(shelves, art.ratings);
    expect(hero?.items[0]).toMatchObject({ avsVoters: 1284, quality: 'HD' });
  });
});

describe('the upcoming shelf once MAL dates its titles', () => {
  const malOf = (startDate: string) => ({
    mal: {
      id: 1,
      score: null,
      voters: null,
      rank: null,
      popularity: null,
      members: null,
      airing: 'not_yet_aired' as const,
      episodes: null,
      startDate,
      startSeason: null,
      trailerYoutubeId: null,
    },
  });
  const upcoming: TitleShelf[] = [
    {
      kind: 'default',
      id: 'upcoming',
      title: 'Sắp ra mắt',
      items: ['u1-a1', 'u2-a2', 'u3-a3', 'u4-a4'].map((slug) =>
        title(slug, 2027),
      ),
    },
  ];
  const now = Date.UTC(2026, 10, 11);
  const names = (shelves: TitleShelf[]) => shelves[0]?.items.map((t) => t.name);

  it('moves a title MAL dates late behind the year-only ones and drops one already out', () => {
    const late = applyRatings(
      upcoming,
      new Map([['u1-a1', malOf('2027-09')]]),
      now,
    );
    expect(names(late)).toEqual(['U2-A2', 'U3-A3', 'U4-A4', 'U1-A1']);

    const out = applyRatings(
      upcoming,
      new Map([['u1-a1', malOf('2026-03-01')]]),
      now,
    );
    expect(names(out)).toEqual(['U2-A2', 'U3-A3', 'U4-A4']);
  });

  it('drops the shelf when fewer than three titles remain', () => {
    const out = applyRatings(
      upcoming,
      new Map([
        ['u1-a1', malOf('2026-03-01')],
        ['u2-a2', malOf('2026-03-01')],
      ]),
      now,
    );
    expect(out).toEqual([]);
  });
});
