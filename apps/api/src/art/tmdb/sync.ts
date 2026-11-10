import { pickBackdrop, pickPoster } from './images.ts';
import { decide, type Candidate, type Matcher } from './matcher.ts';
import type { TmdbClient, TmdbDetail } from './tmdb.ts';
import type { TitleInput } from '../contract.ts';
import { parseSeasonNumber, stripSeasonMarker } from './titles.ts';

export interface TitleArtRow {
  source_slug: string;
  tmdb_id: number;
  tmdb_season: number;
  backdrop_path: string | null;
  backdrop_lang: string | null;
  poster_path: string | null;
  poster_lang: string | null;
}

export interface EpisodeArtRow {
  source_slug: string;
  episode_number: number;
  still_path: string;
}

const CANDIDATE_LIMIT = 5;
const ALTERNATIVE_TITLE_LIMIT = 3;

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

export async function syncTitle(
  input: TitleInput,
  { tmdb, matcher }: SyncDeps,
): Promise<SyncOutcome> {
  const season = parseSeasonNumber(input.seasonName, input.name);
  const results = await tmdb.searchTv(stripSeasonMarker(input.name));
  if (results.length === 0) return skip(input.slug, 'no TMDB search results');

  const details = await Promise.all(
    results.slice(0, CANDIDATE_LIMIT).map((r) => tmdb.tvDetail(r.id)),
  );
  const alternativeTitles = await Promise.all(
    details.map((d, i) =>
      i < ALTERNATIVE_TITLE_LIMIT ? tmdb.tvAlternativeTitles(d.id) : [],
    ),
  );
  const answer = await matcher.match({
    sourceTitle: input.name,
    seasonName: input.seasonName,
    year: input.year,
    episodeCount: input.episodeCount,
    candidates: details.map((d, i) =>
      toCandidate(d, season, alternativeTitles[i] ?? []),
    ),
  });
  const choice = decide(answer);
  if (choice === null) {
    return skip(
      input.slug,
      `no confident match (best probability ${answer.probability.toFixed(2)})`,
    );
  }

  const detail = details.find((d) => d.id === choice);
  if (
    detail?.seasons &&
    !detail.seasons.some((s) => s.season_number === season)
  ) {
    return skip(input.slug, `TMDB ${choice} has no season ${season}`);
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
