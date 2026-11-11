import { describe, expect, it } from 'vitest';
import type { MalStats } from '../../../../api/src/art/contract.ts';
import {
  arrange,
  listingScore,
  ListSearchSchema,
  seasonLabel,
  type SortKey,
} from './airing-list.ts';
import type { Title } from './title.ts';

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

describe('listingScore', () => {
  it('averages the AVS and MAL scores', () => {
    expect(listingScore(title('a', 8, { score: 7 }))).toBe(7.5);
  });
  it('uses the AVS score when MAL has no score', () => {
    expect(listingScore(title('a', 8, { score: null }))).toBe(8);
  });
  it('uses the AVS score when there is no MAL data', () => {
    expect(listingScore(title('a', 8, { noMal: true }))).toBe(8);
  });
  it('does not round', () => {
    expect(listingScore(title('a', 8.4, { score: 7.91 }))).toBeCloseTo(8.155);
  });
});

describe('arrange', () => {
  const titles = [
    title('a', 8, { score: 7 }),
    title('b', 9, { score: null }),
    title('c', 8, { score: 8.5 }),
    title('d', 7, { noMal: true }),
    title('e', 9, { score: 7 }),
  ];

  it('sorts by score descending with upstream order breaking ties', () => {
    expect(names(titles, 'score-desc')).toEqual(['b', 'c', 'e', 'a', 'd']);
  });

  it('sorts by score ascending with upstream order breaking ties', () => {
    expect(names(titles, 'score-asc')).toEqual(['d', 'a', 'e', 'c', 'b']);
  });

  it('keeps the upstream order for equal scores in both directions', () => {
    const tied = [
      title('p', 8, { noMal: true }),
      title('q', 7, { score: 9 }),
      title('r', 8, { score: null }),
    ];
    expect(names(tied, 'score-desc')).toEqual(['p', 'q', 'r']);
    expect(names(tied, 'score-asc')).toEqual(['p', 'q', 'r']);
  });

  it('sorts on the unrounded score', () => {
    const close = [
      title('x', 8, { score: 8.1 }),
      title('y', 8, { score: 8.2 }),
    ];
    expect(names(close, 'score-desc')).toEqual(['y', 'x']);
  });

  it('keeps the upstream order for recent', () => {
    expect(names(titles, 'recent')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  describe('views and voters', () => {
    const counted = [
      { ...title('a', 5), views: 100, avsVoters: 5 },
      title('b', 5),
      { ...title('c', 5), views: 300, avsVoters: 9 },
      { ...title('d', 5), views: 100 },
      { ...title('e', 5), avsVoters: 5 },
    ];
    it('sorts by views descending with missing values last', () => {
      expect(names(counted, 'views-desc')).toEqual(['c', 'a', 'd', 'b', 'e']);
    });
    it('sorts by voters descending with missing values last', () => {
      expect(names(counted, 'voters-desc')).toEqual(['c', 'a', 'e', 'b', 'd']);
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
    expect(parse({ sort: 'score-asc', page: 2 })).toEqual({
      sort: 'score-asc',
      page: 2,
    });
    expect(parse({ sort: 'mal-asc' })).toMatchObject({ sort: 'recent' });
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
