import { pickBackdrop, pickPoster } from './images.ts';
import {
  decide,
  type Candidate,
  type Matcher,
  type MatcherName,
  type MatchQuestion,
} from './matcher.ts';
import type { TmdbClient, TmdbDetail } from './tmdb.ts';
import type { TitleInput } from '../contract.ts';
import { parseSeasonNumber, searchQueries } from './titles.ts';

export interface TitleArtRow {
  source_slug: string;
  tmdb_id: number;
  tmdb_season: number;
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
const MAX_SEARCHES = 3;

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

export async function gatherCandidates(
  input: TitleInput,
  tmdb: TmdbClient,
): Promise<Gathered | null> {
  const season = parseSeasonNumber(input.seasonName, input.name);
  let query = '';
  let results: Awaited<ReturnType<TmdbClient['searchTv']>> = [];
  for (const candidate of searchQueries(input.name).slice(0, MAX_SEARCHES)) {
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
    return skip(
      input.slug,
      `no confident match by ${answer.by} (best probability ${answer.probability.toFixed(2)}) via query '${query}'`,
    );
  }

  const detail = details.find((d) => d.id === choice);
  if (
    detail?.seasons &&
    !detail.seasons.some((s) => s.season_number === season)
  ) {
    return skip(
      input.slug,
      `TMDB ${choice} has no season ${season} via query '${query}'`,
    );
  }

  const [images, seasonDetail] = await Promise.all([
    tmdb.tvImages(choice),
    tmdb.seasonDetail(choice, season),
  ]);
  const backdrop = pickBackdrop(images.backdrops);
  const poster = pickPoster(images.posters);
  return {
    kind: 'matched',
    matched: {
      slug: input.slug,
      tmdbId: choice,
      probability: answer.probability,
      title: {
        source_slug: input.slug,
        tmdb_id: choice,
        tmdb_season: season,
        backdrop_path: backdrop?.path ?? null,
        backdrop_lang: backdrop?.lang ?? null,
        poster_path: poster?.path ?? null,
        poster_lang: poster?.lang ?? null,
        source_name: input.name,
        source_year: input.year ?? null,
        source_episode_count: input.episodeCount ?? null,
        matched_by: answer.by,
      },
      episodes: mapEpisodes(
        input.slug,
        seasonDetail.episodes,
        answer.episodeOffset ?? 0,
        input.episodeCount,
      ),
    },
  };
}
