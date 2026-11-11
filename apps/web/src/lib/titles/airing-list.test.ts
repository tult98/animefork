import { describe, expect, it } from 'vitest';
import type { MalStats } from '../../../../api/src/art/contract.ts';
import {
  arrange,
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
  arrange(titles, { sort }).entries.map((e) => e.title.name);

describe('arrange', () => {
  const titles = [
    title('a', 8, { score: 7 }),
    title('b', 9, { score: null }),
    title('c', 8, { score: 8.5 }),
    title('d', 7, { noMal: true }),
    title('e', 9, { score: 7 }),
  ];

  it('sorts avs descending with upstream order breaking ties', () => {
    expect(names(titles, 'avs-desc')).toEqual(['b', 'e', 'a', 'c', 'd']);
  });

  it('sorts avs both ways with upstream order breaking ties', () => {
    expect(names(titles, 'avs-asc')).toEqual(['d', 'a', 'c', 'b', 'e']);
  });

  it('puts titles without a MAL score last in both directions', () => {
    expect(names(titles, 'mal-desc')).toEqual(['c', 'a', 'e', 'b', 'd']);
    expect(names(titles, 'mal-asc')).toEqual(['a', 'e', 'c', 'b', 'd']);
  });

  it('shows the chip of the sorted source', () => {
    const avs = arrange(titles, { sort: 'recent' });
    expect(avs.source).toBe('avs');
    expect(avs.entries.find((e) => e.title.name === 'a')?.rating).toBe(
      'AVS 8.0',
    );
    const byScore = arrange(titles, { sort: 'mal-desc' });
    expect(byScore.source).toBe('mal');
    expect(byScore.entries.map((e) => e.rating)).toEqual([
      'MAL 8.50',
      'MAL 7.00',
      'MAL 7.00',
      'MAL —',
      'MAL —',
    ]);
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
    it('keeps the AVS chip', () => {
      expect(arrange(counted, { sort: 'views-desc' }).source).toBe('avs');
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
    expect(parse({ sort: 'mal-asc', page: 2 })).toEqual({
      sort: 'mal-asc',
      page: 2,
    });
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
