import type { TmdbKind } from './tmdb.ts';

export interface Candidate {
  kind: TmdbKind;
  id: number;
  name: string;
  originalName: string;
  alternativeTitles: string[];
  firstAirDate?: string;
  showFirstAirDate?: string;
  episodeCount?: number;
  overview?: string;
}

export const candidateKey = (c: Pick<Candidate, 'kind' | 'id'>) =>
  `${c.kind}:${c.id}`;

export interface MatchQuestion {
  slug: string;
  sourceTitle: string;
  // Hepburn romanization of the original title, read from the source slug.
  romaji?: string;
  otherNames?: string[];
  season: number;
  seasonName?: string;
  year?: number;
  episodeCount?: number;
  sideEntry?: boolean;
  candidates: Candidate[];
}

export type MatcherName = 'baseline' | 'jev';

// 'show' means the show is identified but the season is not: art belongs to the show, stills do not.
export type MatchScope = 'season' | 'show';

export interface MatchAnswer {
  choice: number | null;
  kind: TmdbKind;
  probability: number;
  episodeOffset?: number;
  by: MatcherName;
  scope: MatchScope;
  // Set on a rejection that was also judged at show level.
  showProbability?: number;
  sideEntry?: boolean;
}

export interface Matcher {
  match(question: MatchQuestion): Promise<MatchAnswer>;
}

export const MIN_MATCH_PROBABILITY = 0.85;
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

const MIN_ROMAJI_WORDS = 2;

export function scoreCandidate(
  question: MatchQuestion,
  candidate: Candidate,
): number {
  const sources = [question.sourceTitle, ...(question.otherNames ?? [])];
  if (
    question.romaji &&
    normalizeTitle(question.romaji).split(' ').length >= MIN_ROMAJI_WORDS
  ) {
    sources.push(question.romaji);
  }
  const title = Math.max(
    ...[
      candidate.name,
      candidate.originalName,
      ...candidate.alternativeTitles,
    ].flatMap((name) => sources.map((source) => titleSimilarity(source, name))),
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
      .filter((candidate) => candidate.kind === 'tv')
      .map((candidate) => ({
        id: candidate.id,
        score: scoreCandidate(question, candidate),
      }))
      .sort((a, b) => b.score - a.score);
    const [best, runnerUp] = scored;
    if (!best) {
      return {
        choice: null,
        kind: 'tv',
        probability: 0,
        by: 'baseline',
        scope: 'season',
      };
    }
    if (runnerUp && best.score - runnerUp.score < MIN_MARGIN) {
      return {
        choice: null,
        kind: 'tv',
        probability: best.score,
        by: 'baseline',
        scope: 'season',
      };
    }
    return {
      choice: best.id,
      kind: 'tv',
      probability: best.score,
      episodeOffset: 0,
      by: 'baseline',
      scope: 'season',
    };
  }
}

export function decide(answer: MatchAnswer): number | null {
  return answer.choice !== null && answer.probability >= MIN_MATCH_PROBABILITY
    ? answer.choice
    : null;
}

export class CascadeMatcher implements Matcher {
  private readonly baseline: Matcher;
  private readonly second: Matcher;

  constructor(baseline: Matcher, second: Matcher) {
    this.baseline = baseline;
    this.second = second;
  }

  async match(question: MatchQuestion): Promise<MatchAnswer> {
    const answer = await this.baseline.match(question);
    if (decide(answer) !== null || question.candidates.length === 0) {
      return answer;
    }
    return this.second.match(question);
  }
}
