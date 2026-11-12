import { describe, expect, it } from 'vitest';
import type { MalStats } from '../../../../../api/src/art/contract.ts';
import { ratingRanks } from '../rating-rank.ts';
import type { Title } from '../title.ts';

interface Opts {
  voters?: number;
  mal?: { score: number | null; voters: number | null };
}

const title = (name: string, rating: number, opts: Opts = {}): Title => ({
  path: `/phim/${name}/`,
  name,
  image: 'x',
  rating,
  episodeLabel: 'Tập 1',
  genres: [],
  ...(opts.voters === undefined ? {} : { avsVoters: opts.voters }),
  ...(opts.mal
    ? {
        mal: {
          id: 1,
          rank: null,
          popularity: null,
          members: null,
          airing: null,
          episodes: null,
          startDate: null,
          startSeason: null,
          ...opts.mal,
        } satisfies MalStats,
      }
    : {}),
});

// Three fillers at 8.0 with 1000 votes make the prior mean 8 and weight 1000.
const fillers = () => [
  title('f1', 8, { voters: 1000 }),
  title('f2', 8, { voters: 1000 }),
  title('f3', 8, { voters: 1000 }),
];

const rank = (subject: Title[], others = fillers()) =>
  ratingRanks([...subject, ...others]).slice(0, subject.length);

describe('ratingRanks', () => {
  it('puts 9.0 with 20000 votes above 9.5 with 100 votes', () => {
    const [many, few] = rank([
      title('many', 9, { voters: 20000 }),
      title('few', 9.5, { voters: 100 }),
    ]);
    expect(many).toBeGreaterThan(few!);
  });

  it('ranks more votes higher at the same score above the prior', () => {
    const [more, less] = rank([
      title('more', 9, { voters: 5000 }),
      title('less', 9, { voters: 200 }),
    ]);
    expect(more).toBeGreaterThan(less!);
  });

  it('ranks the higher score higher at equal votes', () => {
    const [high, low] = rank([
      title('high', 9, { voters: 800 }),
      title('low', 8.5, { voters: 800 }),
    ]);
    expect(high).toBeGreaterThan(low!);
  });

  it('pulls a title below the prior up toward it with few votes', () => {
    const [few, many] = rank([
      title('few', 5, { voters: 10 }),
      title('many', 5, { voters: 20000 }),
    ]);
    expect(few).toBeGreaterThan(many!);
    expect(few).toBeLessThan(0);
    expect(many).toBeLessThan(-1.5);
  });

  it('gives zero deviation to a score with no votes', () => {
    const [none] = rank([title('none', 9.9)]);
    expect(none).toBeCloseTo(0, 10);
  });

  it('computes the weighted rating exactly', () => {
    const [value] = rank([title('x', 9, { voters: 1000 })]);
    const prior = (9 + 8 * 3) / 4;
    expect(value).toBeCloseTo(0.5 * (9 - prior), 10);
  });

  it('ranks a title with only an AVS score', () => {
    const [value] = rank([title('x', 9, { voters: 3000, mal: undefined })]);
    const prior = (9 + 8 * 3) / 4;
    expect(value).toBeCloseTo((3000 / 4000) * (9 - prior), 10);
  });

  it('ignores a MAL score that is null', () => {
    const [value] = rank([
      title('x', 9, { voters: 1000, mal: { score: null, voters: 500 } }),
    ]);
    const prior = (9 + 8 * 3) / 4;
    expect(value).toBeCloseTo(0.5 * (9 - prior), 10);
  });

  it('compares plain scores with their mean when nobody has votes', () => {
    const [a, b] = ratingRanks([title('a', 9.1), title('b', 7.3)]);
    expect(a).toBeCloseTo(0.9, 10);
    expect(b).toBeCloseTo(-0.9, 10);
  });

  it('averages the deviations of both sources from their own priors', () => {
    const malFillers = [1, 2, 3].map((n) =>
      title(`m${n}`, 8, { voters: 1000, mal: { score: 7, voters: 2000 } }),
    );
    const subject = title('s', 9, {
      voters: 1000,
      mal: { score: 8, voters: 2000 },
    });
    const [value] = ratingRanks([subject, ...malFillers]);
    const avsC = (9 + 8 * 3) / 4;
    const avs = 0.5 * (9 - avsC);
    const malC = (8 + 7 * 3) / 4;
    const mal = 0.5 * (8 - malC);
    expect(value).toBeCloseTo((avs + mal) / 2, 10);
  });

  // Both sources have mean 8 / 7 and every title has 1000 votes, so a title one
  // point above its mean has deviation 0.5 whatever the source's scale is.
  const scaled = () => {
    const both = (n: string, avs: number, mal: number) =>
      title(n, avs, { voters: 1000, mal: { score: mal, voters: 1000 } });
    return [
      both('both', 9, 8),
      both('bothLow', 7, 6),
      title('avsOnly', 9, { voters: 1000 }),
      title('avsOnlyLow', 7, { voters: 1000 }),
      both('f1', 8, 7),
      both('f2', 8, 7),
    ];
  };

  it('ranks the same relative standing equal with or without MAL', () => {
    const [both, , avsOnly] = ratingRanks(scaled());
    expect(both).toBeCloseTo(0.5, 10);
    expect(both).toBeCloseTo(avsOnly!, 10);
  });

  it('keeps a title above both means over a lower AVS-only title after MAL arrives', () => {
    const list = (withMal: boolean) => [
      title('s', 9, {
        voters: 1000,
        ...(withMal ? { mal: { score: 7.5, voters: 1000 } } : {}),
      }),
      title('t', 8.5, { voters: 1000 }),
      ...[1, 2, 3].map((n) =>
        title(`f${n}`, 8, { voters: 1000, mal: { score: 7, voters: 1000 } }),
      ),
    ];
    for (const withMal of [false, true]) {
      const [s, t] = ratingRanks(list(withMal));
      expect(s).toBeGreaterThan(t!);
    }
  });
});
