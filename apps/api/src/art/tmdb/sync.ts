import { pickBackdrop, pickPoster } from './images.ts';
import {
  decide,
  type Candidate,
  type Matcher,
  type MatcherName,
  type MatchAnswer,
  type MatchScope,
  type MatchQuestion,
} from './matcher.ts';
import type { TmdbClient, TmdbDetail } from './tmdb.ts';
import type { TitleInput } from '../contract.ts';
import {
  distinctRomaji,
  nameQueries,
  parseSeasonNumber,
  searchQueries,
} from './titles.ts';

export interface TitleArtRow {
  source_slug: string;
  tmdb_id: number;
  tmdb_season: number | null;
  match_scope: MatchScope;
  backdrop_path: string | null;
  backdrop_lang: string | null;
  poster_path: string | null;
  poster_lang: string | null;
  source_name: string;
  source_year: number | null;
  source_episode_count: number | null;
  matched_by: MatcherName;
}

export interface EpisodeArtRow {
  source_slug: string;
  episode_number: number;
  still_path: string;
}

const CANDIDATE_LIMIT = 5;
const ALTERNATIVE_TITLE_LIMIT = 3;
const MAX_SEARCHES = 5;

export interface MatchedTitle {
  slug: string;
  tmdbId: number;
  probability: number;
  title: TitleArtRow;
  episodes: EpisodeArtRow[];
}

export interface SkippedTitle {
  slug: string;
  reason: string;
}

export type SyncOutcome =
  | { kind: 'matched'; matched: MatchedTitle }
  | { kind: 'skipped'; skipped: SkippedTitle };

export interface SyncDeps {
  tmdb: TmdbClient;
  matcher: Matcher;
}

function toCandidate(
  detail: TmdbDetail,
  season: number,
  alternativeTitles: string[],
): Candidate {
  const entry = detail.seasons?.find((s) => s.season_number === season);
  return {
    id: detail.id,
    name: detail.name,
    originalName: detail.original_name,
    alternativeTitles,
    firstAirDate:
      (season > 1 ? entry?.air_date : detail.first_air_date) ?? undefined,
    episodeCount: entry?.episode_count ?? detail.number_of_episodes,
    ...(detail.overview ? { overview: detail.overview } : {}),
  };
}

export function mapEpisodes(
  slug: string,
  episodes: { episode_number: number; still_path: string | null }[],
  offset: number,
  sourceEpisodeCount?: number,
): EpisodeArtRow[] {
  const rows: EpisodeArtRow[] = [];
  for (const episode of episodes) {
    if (!episode.still_path) continue;
    const number = episode.episode_number + offset;
    if (number < 1) continue;
    if (sourceEpisodeCount && number > sourceEpisodeCount) continue;
    rows.push({
      source_slug: slug,
      episode_number: number,
      still_path: episode.still_path,
    });
  }
  return rows;
}

function skip(slug: string, reason: string): SyncOutcome {
  return { kind: 'skipped', skipped: { slug, reason } };
}

export interface Gathered {
  season: number;
  query: string;
  question: MatchQuestion;
  details: TmdbDetail[];
}

export function tmdbQueries(input: TitleInput): string[] {
  const base = searchQueries(input.name, input.slug).slice(0, MAX_SEARCHES);
  return [...base, ...nameQueries(input.otherNames, base)];
}

export async function gatherCandidates(
  input: TitleInput,
  tmdb: TmdbClient,
): Promise<Gathered | null> {
  const season = parseSeasonNumber(input.seasonName, input.name);
  let query = '';
  let results: Awaited<ReturnType<TmdbClient['searchTv']>> = [];
  for (const candidate of tmdbQueries(input)) {
    query = candidate;
    results = await tmdb.searchTv(candidate);
    if (results.length > 0) break;
  }
  if (results.length === 0) return null;

  const details = await Promise.all(
    results.slice(0, CANDIDATE_LIMIT).map((r) => tmdb.tvDetail(r.id)),
  );
  const alternativeTitles = await Promise.all(
    details.map((d, i) =>
      i < ALTERNATIVE_TITLE_LIMIT ? tmdb.tvAlternativeTitles(d.id) : [],
    ),
  );
  return {
    season,
    query,
    details,
    question: {
      slug: input.slug,
      sourceTitle: input.name,
      romaji: distinctRomaji(input.slug, input.name),
      ...(input.otherNames !== undefined &&
        input.otherNames.length > 0 && { otherNames: input.otherNames }),
      season,
      seasonName: input.seasonName,
      year: input.year,
      episodeCount: input.episodeCount,
      candidates: details.map((d, i) =>
        toCandidate(d, season, alternativeTitles[i] ?? []),
      ),
    },
  };
}

// TMDB art is per show, so a season TMDB lacks costs the stills and nothing else.
export function effectiveScope(
  answer: Pick<MatchAnswer, 'scope'>,
  choice: number,
  details: TmdbDetail[],
  season: number,
): MatchScope {
  if (answer.scope === 'show') return 'show';
  const seasons = details.find((d) => d.id === choice)?.seasons;
  return seasons && !seasons.some((s) => s.season_number === season)
    ? 'show'
    : 'season';
}

function matchedOutcome(
  input: TitleInput,
  answer: MatchAnswer,
  tmdbId: number,
  scope: MatchScope,
  images: Awaited<ReturnType<TmdbClient['tvImages']>>,
  episodes: EpisodeArtRow[],
  season: number | null = null,
): SyncOutcome {
  const backdrop = pickBackdrop(images.backdrops);
  const poster = pickPoster(images.posters);
  return {
    kind: 'matched',
    matched: {
      slug: input.slug,
      tmdbId,
      probability: answer.probability,
      title: {
        source_slug: input.slug,
        tmdb_id: tmdbId,
        tmdb_season: scope === 'season' ? season : null,
        match_scope: scope,
        backdrop_path: backdrop?.path ?? null,
        backdrop_lang: backdrop?.lang ?? null,
        poster_path: poster?.path ?? null,
        poster_lang: poster?.lang ?? null,
        source_name: input.name,
        source_year: input.year ?? null,
        source_episode_count: input.episodeCount ?? null,
        matched_by: answer.by,
      },
      episodes,
    },
  };
}

export async function syncTitle(
  input: TitleInput,
  { tmdb, matcher }: SyncDeps,
): Promise<SyncOutcome> {
  const gathered = await gatherCandidates(input, tmdb);
  if (!gathered) return skip(input.slug, 'no TMDB search results');
  const { season, query, question, details } = gathered;

  const answer = await matcher.match(question);
  const choice = decide(answer);
  if (choice === null) {
    const show =
      answer.showProbability === undefined
        ? ''
        : `, show probability ${answer.showProbability.toFixed(2)}`;
    return skip(
      input.slug,
      `no confident match by ${answer.by} (best probability ${answer.probability.toFixed(2)}${show}) via query '${query}'`,
    );
  }

  const scope = effectiveScope(answer, choice, details, season);
  if (scope === 'show') {
    const images = await tmdb.tvImages(choice);
    return matchedOutcome(input, answer, choice, 'show', images, []);
  }

  const [images, seasonDetail] = await Promise.all([
    tmdb.tvImages(choice),
    tmdb.seasonDetail(choice, season),
  ]);
  const episodes = mapEpisodes(
    input.slug,
    seasonDetail.episodes,
    answer.episodeOffset ?? 0,
    input.episodeCount,
  );
  return matchedOutcome(
    input,
    answer,
    choice,
    'season',
    images,
    episodes,
    season,
  );
}
