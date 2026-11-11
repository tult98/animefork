import type { Title } from './title.ts';

interface Rated {
  score: number | null | undefined;
  votes: number | null | undefined;
}

const SOURCES: ((title: Title) => Rated)[] = [
  (t) => ({ score: t.rating, votes: t.avsVoters }),
  (t) => ({ score: t.mal?.score, votes: t.mal?.voters }),
];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// A bare average lets 9.5 from 100 voters beat 9.0 from 20000. Each source is
// shrunk toward its own list mean by its own median vote count (the IMDb
// weighted rating), so the two sources, whose vote scales differ, need no
// constants. The sources also sit on different score scales (AVS runs near 9,
// MAL near 8), so averaging the weighted ratings would drag a title down just
// for having MAL data. Instead each source contributes its deviation from its
// own prior mean, and the rank value is the mean of those deviations. A source
// nobody has votes for has no prior, so it uses the plain mean of its scores
// and no shrink. The prior comes from the loaded list, so values move when
// more titles arrive. Only ever compare them within one list.
export function ratingRanks(titles: readonly Title[]): number[] {
  const deviations = SOURCES.map((read) => {
    const scored = titles
      .map(read)
      .filter(
        (r): r is { score: number; votes: number | null | undefined } =>
          r.score != null,
      );
    if (scored.length === 0) return () => null;
    const voted = scored.filter((r) => (r.votes ?? 0) > 0) as {
      score: number;
      votes: number;
    }[];
    if (voted.length === 0) {
      const mean = scored.reduce((sum, r) => sum + r.score, 0) / scored.length;
      return (t: Title) => {
        const { score } = read(t);
        return score == null ? null : score - mean;
      };
    }
    const prior = voted.reduce((sum, r) => sum + r.score, 0) / voted.length;
    const weight = median(voted.map((r) => r.votes));
    return (t: Title) => {
      const { score, votes } = read(t);
      if (score == null) return null;
      const v = votes ?? 0;
      return (v / (v + weight)) * (score - prior);
    };
  });
  return titles.map((t) => {
    const values = deviations
      .map((f) => f(t))
      .filter((x): x is number => x !== null);
    return values.reduce((a, b) => a + b, 0) / values.length;
  });
}
