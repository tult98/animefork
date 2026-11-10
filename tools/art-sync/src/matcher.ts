export interface Candidate {
  id: number;
  name: string;
  originalName: string;
  firstAirDate?: string;
  episodeCount?: number;
}

export interface MatchQuestion {
  sourceTitle: string;
  seasonName?: string;
  year?: number;
  episodeCount?: number;
  candidates: Candidate[];
}

export interface MatchAnswer {
  choice: number | null;
  probability: number;
  // Source episode n is TMDB episode n - episodeOffset, for sites that number episodes across seasons.
  episodeOffset?: number;
}

export interface Matcher {
  match(question: MatchQuestion): Promise<MatchAnswer>;
}

// A wrong match is worse than no match, so anything below this writes no row.
export const MIN_MATCH_PROBABILITY = 0.85;
// The best candidate must beat the runner-up by this much, or the title is ambiguous.
const MIN_MARGIN = 0.05;

const SEASON_MARKERS = [
  /\b(?:season|mua|phan|part|cour)\s*\d+\b/g,
  /\b\d+(?:st|nd|rd|th)\s+season\b/g,
];

export function normalizeTitle(title: string): string {
  let text = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd');
  text = text.replace(/[^\p{L}\p{N}]+/gu, ' ');
  for (const marker of SEASON_MARKERS) text = text.replace(marker, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const gx = bigrams(x);
  const gy = bigrams(y);
  let overlap = 0;
  for (const [gram, n] of gx) overlap += Math.min(n, gy.get(gram) ?? 0);
  const total = x.length - 1 + (y.length - 1);
  return total > 0 ? (2 * overlap) / total : 0;
}

// A signal the source does not know yet earns partial credit, so an exact title alone clears the threshold.
const UNKNOWN_CREDIT = 0.6;
const WEIGHTS = { title: 0.7, year: 0.15, episodes: 0.15 };

function yearScore(known: number | undefined, candidate?: string): number {
  const year = candidate ? Number.parseInt(candidate.slice(0, 4), 10) : NaN;
  if (known === undefined || Number.isNaN(year)) return UNKNOWN_CREDIT;
  const diff = Math.abs(known - year);
  return diff === 0 ? 1 : diff === 1 ? 0.5 : 0;
}

function episodeScore(known: number | undefined, candidate?: number): number {
  if (!known || !candidate) return UNKNOWN_CREDIT;
  return Math.min(known, candidate) / Math.max(known, candidate);
}

export function scoreCandidate(
  question: MatchQuestion,
  candidate: Candidate,
): number {
  const title = Math.max(
    titleSimilarity(question.sourceTitle, candidate.name),
    titleSimilarity(question.sourceTitle, candidate.originalName),
  );
  return (
    WEIGHTS.title * title +
    WEIGHTS.year * yearScore(question.year, candidate.firstAirDate) +
    WEIGHTS.episodes *
      episodeScore(question.episodeCount, candidate.episodeCount)
  );
}

export class BaselineMatcher implements Matcher {
  async match(question: MatchQuestion): Promise<MatchAnswer> {
    const scored = question.candidates
      .map((candidate) => ({
        id: candidate.id,
        score: scoreCandidate(question, candidate),
      }))
      .sort((a, b) => b.score - a.score);
    const [best, runnerUp] = scored;
    if (!best) return { choice: null, probability: 0 };
    if (runnerUp && best.score - runnerUp.score < MIN_MARGIN) {
      return { choice: null, probability: best.score };
    }
    return { choice: best.id, probability: best.score, episodeOffset: 0 };
  }
}

// Seam for the Jev (typesafe.ai) matcher. Implement Matcher here once its API is known; the sync only depends on the interface.
export function createJevMatcher(): Matcher {
  throw new Error('The Jev matcher is not implemented yet.');
}

export function decide(answer: MatchAnswer): number | null {
  return answer.choice !== null && answer.probability >= MIN_MATCH_PROBABILITY
    ? answer.choice
    : null;
}
