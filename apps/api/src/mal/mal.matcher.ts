import {
  distinctRomaji,
  parseCourNumber,
  parseSeasonNumber,
  slugSeasonNumber,
  stripSeasonMarker,
} from '../art/tmdb/titles.ts';
import { titleSimilarity } from '../art/tmdb/matcher.ts';
import type { TitleInput } from '../art/contract.ts';
import type { MalCandidate } from './mal.client.ts';

export const MIN_MAL_SCORE = 0.8;
// The runner-up must trail by this much, or the match is a coin flip between seasons.
export const MIN_MAL_MARGIN = 0.05;
// "Part 2" of a season shares its name with the whole season, so it must not win a tie against it.
const LATER_PART_PENALTY = 0.1;

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

export const isShow = (c: MalCandidate) => !NOT_A_SHOW.has(c.mediaType ?? '');

// A later season, a remake or a live action shares the show's name but starts years after it.
export const MAX_YEAR_GAP = 1;

export function startYear(
  c: Pick<MalCandidate, 'year' | 'startDate'>,
): number | undefined {
  const year = c.year ?? Number.parseInt(c.startDate?.slice(0, 4) ?? '', 10);
  return Number.isNaN(year) ? undefined : year;
}

export function fitsYear(
  input: Pick<TitleInput, 'year'>,
  c: Pick<MalCandidate, 'year' | 'startDate'>,
): boolean {
  const year = startYear(c);
  return (
    input.year === undefined ||
    year === undefined ||
    Math.abs(input.year - year) <= MAX_YEAR_GAP
  );
}

export interface MalMatch {
  candidate: MalCandidate;
  score: number;
}

function candidateTitles(c: MalCandidate): string[] {
  return [c.title, c.english, ...c.synonyms].filter((t): t is string =>
    Boolean(t),
  );
}

function nameScore(
  input: TitleInput,
  c: MalCandidate,
  aliases: string[],
): number {
  const sources = [
    ...aliases,
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

// A translated name may carry no marker while the source slug still says "2nd-season".
export function wantedSeason(input: TitleInput): number {
  const named = parseSeasonNumber(input.seasonName, input.name);
  return named > 1 ? named : slugSeasonNumber(input.slug);
}

const ROMAN_SEASON: Record<string, number> = { II: 2, III: 3, IV: 4 };
// "X II", "X 2" and "X II: Subtitle" name a sequel, while "Movie 2", "Part 2" or "No. 8" count something else.
const SEQUEL_NUMBER =
  /(?<!\b(?:movie|film|part|cour|no\.?|vol\.?))\s(II|III|IV|\d{1,2})\s*(?::|$)/i;

// The season a MAL entry's titles name; a first season carries no marker.
export function entrySeason(titles: (string | null | undefined)[]): number {
  for (const title of titles) {
    if (!title) continue;
    const marked = parseSeasonNumber(undefined, title);
    if (marked > 1) return marked;
    const word = SEQUEL_NUMBER.exec(title)?.[1];
    const numbered = word && (ROMAN_SEASON[word.toUpperCase()] ?? Number(word));
    if (numbered && numbered > 1) return numbered;
  }
  return 1;
}

function cour(texts: string[]): number {
  return Math.max(1, ...texts.map(parseCourNumber));
}

function courPenalty(input: TitleInput, c: MalCandidate): number {
  const wanted = cour([input.name, input.seasonName ?? '']);
  return cour(candidateTitles(c)) > wanted ? LATER_PART_PENALTY : 0;
}

// MAL names a later season "X 2nd Season" or "X Season 2"; a first season carries no marker at all.
function seasonScore(input: TitleInput, c: MalCandidate): number {
  const wanted = wantedSeason(input);
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

export function scoreCandidate(
  input: TitleInput,
  c: MalCandidate,
  aliases: string[] = [],
): number {
  const type = MEDIA_TYPE_SCORE[c.mediaType ?? ''] ?? 0;
  return (
    -courPenalty(input, c) +
    WEIGHTS.name * nameScore(input, c, aliases) +
    WEIGHTS.season * seasonScore(input, c) +
    WEIGHTS.year * yearScore(input, c) +
    WEIGHTS.episodes * episodeScore(input, c) +
    WEIGHTS.type * type
  );
}

export function matchMal(
  input: TitleInput,
  candidates: MalCandidate[],
  // Other names for the same show, such as the English title TMDB knows it by.
  aliases: string[] = [],
): MalMatch | null {
  const ranked = candidates
    .filter((c) => isShow(c) && fitsYear(input, c))
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(input, candidate, aliases),
    }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  if (!best || best.score < MIN_MAL_SCORE) return null;
  if (second && best.score - second.score < MIN_MAL_MARGIN) return null;
  return best;
}
