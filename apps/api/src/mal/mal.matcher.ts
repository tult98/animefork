import {
  distinctRomaji,
  parseSeasonNumber,
  stripSeasonMarker,
} from '../art/tmdb/titles.ts';
import { titleSimilarity } from '../art/tmdb/matcher.ts';
import type { TitleInput } from '../art/contract.ts';
import type { MalCandidate } from './mal.client.ts';

export const MIN_MAL_SCORE = 0.8;
// The runner-up must trail by this much, or the match is a coin flip between seasons.
export const MIN_MAL_MARGIN = 0.08;

const WEIGHTS = {
  name: 0.45,
  season: 0.2,
  year: 0.2,
  episodes: 0.1,
  type: 0.05,
};

const MEDIA_TYPE_SCORE: Record<string, number> = {
  tv: 1,
  ona: 1,
  ova: 0.6,
  special: 0.6,
  tv_special: 0.6,
  movie: 0.3,
};

// Promos, commercials and music videos share a show's name but are never what the source lists.
const NOT_A_SHOW = new Set(['pv', 'cm', 'music']);

export interface MalMatch {
  candidate: MalCandidate;
  score: number;
}

function candidateTitles(c: MalCandidate): string[] {
  return [c.title, c.english, ...c.synonyms].filter((t): t is string =>
    Boolean(t),
  );
}

function nameScore(input: TitleInput, c: MalCandidate): number {
  const sources = [
    stripSeasonMarker(input.name),
    distinctRomaji(input.slug, input.name),
  ].filter((s): s is string => Boolean(s));
  let best = 0;
  for (const source of sources) {
    for (const title of candidateTitles(c)) {
      best = Math.max(best, titleSimilarity(source, title));
    }
  }
  return best;
}

// MAL names a later season "X 2nd Season" or "X Season 2"; a first season carries no marker at all.
function seasonScore(input: TitleInput, c: MalCandidate): number {
  const wanted = parseSeasonNumber(input.seasonName, input.name);
  const seasons = candidateTitles(c).map((t) =>
    parseSeasonNumber(undefined, t),
  );
  const marked = seasons.find((s) => s > 1);
  return (marked ?? 1) === wanted ? 1 : 0;
}

function yearScore(input: TitleInput, c: MalCandidate): number {
  if (input.year === undefined || c.year === undefined) return 0.5;
  const gap = Math.abs(input.year - c.year);
  return gap === 0 ? 1 : gap === 1 ? 0.5 : 0;
}

function episodeScore(input: TitleInput, c: MalCandidate): number {
  if (input.episodeCount === undefined || c.episodes === undefined) return 0.5;
  return input.episodeCount === c.episodes ? 1 : 0;
}

export function scoreCandidate(input: TitleInput, c: MalCandidate): number {
  const type = MEDIA_TYPE_SCORE[c.mediaType ?? ''] ?? 0;
  return (
    WEIGHTS.name * nameScore(input, c) +
    WEIGHTS.season * seasonScore(input, c) +
    WEIGHTS.year * yearScore(input, c) +
    WEIGHTS.episodes * episodeScore(input, c) +
    WEIGHTS.type * type
  );
}

export function matchMal(
  input: TitleInput,
  candidates: MalCandidate[],
): MalMatch | null {
  const ranked = candidates
    .filter((c) => !NOT_A_SHOW.has(c.mediaType ?? ''))
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(input, candidate),
    }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  if (!best || best.score < MIN_MAL_SCORE) return null;
  if (second && best.score - second.score < MIN_MAL_MARGIN) return null;
  return best;
}
