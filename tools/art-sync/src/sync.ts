import { pickBackdrop } from './backdrop.ts';
import { decide, type Candidate, type Matcher } from './matcher.ts';
import type { EpisodeArtRow, TitleArtRow } from './schema.ts';
import type { TmdbClient, TmdbDetail } from './tmdb.ts';
import { parseSeasonNumber, type TitleInput } from './titles.ts';

const CANDIDATE_LIMIT = 5;

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

function toCandidate(detail: TmdbDetail, season: number): Candidate {
  const entry = detail.seasons?.find((s) => s.season_number === season);
  return {
    id: detail.id,
    name: detail.name,
    originalName: detail.original_name,
    firstAirDate:
      (season > 1 ? entry?.air_date : undefined) ??
      detail.first_air_date ??
      undefined,
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
  const season = parseSeasonNumber(input.seasonName);
  const results = await tmdb.searchTv(input.name);
  if (results.length === 0) return skip(input.slug, 'no TMDB search results');

  const details = await Promise.all(
    results.slice(0, CANDIDATE_LIMIT).map((r) => tmdb.tvDetail(r.id)),
  );
  const answer = await matcher.match({
    sourceTitle: input.name,
    seasonName: input.seasonName,
    year: input.year,
    episodeCount: input.episodeCount,
    candidates: details.map((d) => toCandidate(d, season)),
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
  const backdrop = pickBackdrop(images);
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

export interface SyncReport {
  matches: {
    slug: string;
    tmdbId: number;
    season: number;
    probability: number;
    backdrop: { path: string; lang: string | null } | null;
    stills: number;
  }[];
  skipped: SkippedTitle[];
  counts: {
    titles: number;
    matched: number;
    skipped: number;
    withBackdrop: number;
    withStills: number;
    episodeRows: number;
  };
}

export interface ArtSink {
  write(titles: TitleArtRow[], episodes: EpisodeArtRow[]): Promise<void>;
}

export async function syncAll(
  inputs: TitleInput[],
  deps: SyncDeps,
  sink?: ArtSink,
): Promise<SyncReport> {
  const matched: MatchedTitle[] = [];
  const skipped: SkippedTitle[] = [];
  for (const input of inputs) {
    try {
      const outcome = await syncTitle(input, deps);
      if (outcome.kind === 'matched') matched.push(outcome.matched);
      else skipped.push(outcome.skipped);
    } catch (error) {
      skipped.push({
        slug: input.slug,
        reason: `error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  await sink?.write(
    matched.map((m) => m.title),
    matched.flatMap((m) => m.episodes),
  );
  return {
    matches: matched.map((m) => ({
      slug: m.slug,
      tmdbId: m.tmdbId,
      season: m.title.tmdb_season,
      probability: Number(m.probability.toFixed(3)),
      backdrop: m.title.backdrop_path
        ? { path: m.title.backdrop_path, lang: m.title.backdrop_lang }
        : null,
      stills: m.episodes.length,
    })),
    skipped,
    counts: {
      titles: inputs.length,
      matched: matched.length,
      skipped: skipped.length,
      withBackdrop: matched.filter((m) => m.title.backdrop_path).length,
      withStills: matched.filter((m) => m.episodes.length > 0).length,
      episodeRows: matched.reduce((n, m) => n + m.episodes.length, 0),
    },
  };
}
