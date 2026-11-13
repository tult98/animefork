import { describe, expect, it } from 'vitest';
import type { MalStats } from '../../../../../api/src/art/contract.ts';
import {
  arrange,
  ListSearchSchema,
  seasonLabel,
  type SortKey,
} from '../airing-list.ts';
import type { Title } from '../title.ts';

const mal = (over: Partial<MalStats>): MalStats => ({
  id: 1,
  score: null,
  voters: null,
  rank: null,
  popularity: null,
  members: null,
  airing: null,
  episodes: null,
  startDate: null,
  startSeason: null,
  trailerYoutubeId: null,
  ...over,
});

interface Extra {
  score?: number | null;
  noMal?: boolean;
}

const title = (name: string, rating: number, extra: Extra = {}): Title => ({
  path: `/phim/${name}/`,
  name,
  image: 'x',
  rating,
  episodeLabel: 'Tập 1',
  genres: [],
  ...(extra.noMal
    ? {}
    : {
        mal: mal({ score: extra.score ?? null }),
      }),
});

const names = (titles: Title[], sort: SortKey) =>
  arrange(titles, { sort }).map((t) => t.name);

describe('arrange', () => {
  const titles = [
    title('a', 8, { score: 7 }),
    title('b', 9, { score: null }),
    title('c', 8, { score: 8.5 }),
    title('d', 7, { noMal: true }),
    title('e', 9, { score: 7 }),
  ];

  it('keeps the upstream order for recent', () => {
    expect(names(titles, 'recent')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  describe('rating', () => {
    const voted = [
      { ...title('few', 9.5, { noMal: true }), avsVoters: 100 },
      { ...title('many', 9, { noMal: true }), avsVoters: 20000 },
      { ...title('mid', 8, { noMal: true }), avsVoters: 1000 },
      { ...title('low', 7, { noMal: true }), avsVoters: 1000 },
    ];
    it('ranks by vote-weighted rating, highest first', () => {
      expect(names(voted, 'rating-desc')).toEqual([
        'many',
        'few',
        'mid',
        'low',
      ]);
    });
    it('reverses the order for ascending', () => {
      expect(names(voted, 'rating-asc')).toEqual(
        names(voted, 'rating-desc').reverse(),
      );
    });
    it('keeps the upstream order for equal values in both directions', () => {
      const tied = [
        title('p', 8, { noMal: true }),
        title('q', 8, { noMal: true }),
      ];
      expect(names(tied, 'rating-desc')).toEqual(['p', 'q']);
      expect(names(tied, 'rating-asc')).toEqual(['p', 'q']);
    });
  });

  describe('views', () => {
    const counted = [
      { ...title('a', 5), views: 100 },
      title('b', 5),
      { ...title('c', 5), views: 300 },
      { ...title('d', 5), views: 100 },
    ];
    it('sorts by views descending with missing values last', () => {
      expect(names(counted, 'views-desc')).toEqual(['c', 'a', 'd', 'b']);
    });
  });
});

describe('ListSearchSchema', () => {
  it('defaults a missing value', () => {
    expect(ListSearchSchema.parse({})).toEqual({
      sort: 'recent',
      page: 1,
    });
  });
  it('keeps params it does not own', () => {
    expect(ListSearchSchema.parse({ transport: 'replay' })).toEqual({
      transport: 'replay',
      sort: 'recent',
      page: 1,
    });
  });
  it('falls back per field on a bad value', () => {
    const parse = (raw: unknown) => ListSearchSchema.parse(raw);
    expect(parse({ sort: 'rating-asc', page: 2 })).toEqual({
      sort: 'rating-asc',
      page: 2,
    });
    expect(parse({ sort: 'mal-asc' })).toMatchObject({ sort: 'recent' });
    for (const old of ['score-desc', 'score-asc', 'voters-desc']) {
      expect(parse({ sort: old })).toMatchObject({ sort: 'recent' });
    }
    expect(parse({ sort: 'az' })).toMatchObject({ sort: 'recent' });
    expect(parse({ sort: null })).toMatchObject({ sort: 'recent' });
  });
  it.each([0, -2, 1.5, 'x', null, '3'])('falls back from page %j', (page) => {
    expect(ListSearchSchema.parse({ page }).page).toBe(1);
  });
});

describe('seasonLabel', () => {
  it('reads the season page path', () => {
    expect(seasonLabel('/season/autumn/2026/')).toBe('Mùa thu 2026');
    expect(seasonLabel('/season/spring/2027')).toBe('Mùa xuân 2027');
  });
  it('has no label for anything else', () => {
    expect(seasonLabel('/anime-season/x/')).toBeNull();
    expect(seasonLabel(null)).toBeNull();
  });
});
