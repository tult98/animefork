import type { StoredMal } from '../../mal/mal.store.ts';
import type { TitleInput } from '../contract.ts';
import { pickBackdrop, pickPoster } from './images.ts';
import { normalizeTitle, titleSimilarity, type MatchScope } from './matcher.ts';
import {
  ANIMATION_GENRE,
  mapEpisodes,
  type EpisodeArtRow,
  type SyncOutcome,
} from './sync.ts';
import type { TmdbClient, TmdbImages, TmdbKind, TmdbSeason } from './tmdb.ts';
import { searchQueries, stripPartMarker } from './titles.ts';

export interface MalFacts {
  malId: number;
  title: string;
  english: string | null;
  synonyms: string[];
  mediaType: string;
  startDate: string;
  episodes: number | null;
}

export function malFacts(row: StoredMal | undefined): MalFacts | null {
  if (
    row?.status !== 'ok' ||
    row.malId === null ||
    row.matchedTitle === null ||
    row.mediaType === null ||
    row.startDate === null
  ) {
    return null;
  }
  return {
    malId: row.malId,
    title: row.matchedTitle,
    english: row.english,
    synonyms: row.synonyms,
    mediaType: row.mediaType,
    startDate: row.startDate,
    episodes: row.episodes,
  };
}

const SERIES_TYPES = new Set(['tv', 'ona']);

export const isSeries = (facts: Pick<MalFacts, 'mediaType'>) =>
  SERIES_TYPES.has(facts.mediaType);

const DAY = 24 * 60 * 60_000;
const MAX_SYNONYMS = 2;
const MAX_SEARCHES = 6;
const ALTERNATIVE_TITLE_LIMIT = 3;
const MIN_NAME_SCORE = 0.6;
const NEAR_BEST = 0.05;
const MOVIE_YEAR_SLACK = 1;
// TMDB sometimes dates a show a few weeks after MAL does, by its first TV airing rather than a premiere.
const AIRS_AFTER_SLACK = 30 * DAY;
const SEASON_WINDOW = 60 * DAY;
const EPISODE_WINDOW = 14 * DAY;

interface Found {
  kind: TmdbKind;
  id: number;
  names: string[];
  date: number;
  score: number;
}

const dayOf = (text: string | null | undefined): number | null => {
  const time = text ? Date.parse(text) : NaN;
  return Number.isNaN(time) ? null : time;
};

const yearOf = (time: number) => new Date(time).getUTCFullYear();

function scoringNames(facts: MalFacts): string[] {
  return distinctNames(facts, facts.synonyms.length);
}

function searchNames(facts: MalFacts): string[] {
  return distinctNames(facts, MAX_SYNONYMS);
}

function distinctNames(facts: MalFacts, synonyms: number): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const all = [
    facts.english,
    facts.title,
    ...facts.synonyms.slice(0, synonyms),
  ];
  for (const name of all) {
    const key = name ? normalizeTitle(name) : '';
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function malQueries(names: string[], series: boolean): string[] {
  const variants = names.map((name) =>
    searchQueries(series ? stripPartMarker(name) : name),
  );
  const ordered = [
    ...variants.map((v) => v[0]),
    ...variants.flatMap((v) => v.slice(1)),
  ].filter((q): q is string => Boolean(q));
  const seen = new Set<string>();
  return ordered
    .filter((q) => {
      const key = q.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SEARCHES);
}

function nameScore(names: string[], candidateNames: string[]): number {
  let best = 0;
  for (const name of names) {
    for (const other of candidateNames) {
      best = Math.max(best, titleSimilarity(name, other));
    }
  }
  return best;
}

async function search(
  queries: string[],
  names: string[],
  find: (query: string) => Promise<Omit<Found, 'score'>[]>,
  alternativeTitles: (id: number) => Promise<string[]>,
): Promise<Found[]> {
  const found = new Map<number, Found>();
  for (const query of queries) {
    for (const result of await find(query)) {
      if (found.has(result.id)) continue;
      found.set(result.id, {
        ...result,
        score: nameScore(names, result.names),
      });
    }
    if ([...found.values()].some((f) => f.score >= MIN_NAME_SCORE)) break;
  }
  const results = [...found.values()];
  if (results.some((f) => f.score >= MIN_NAME_SCORE)) return results;
  return Promise.all(
    results.map(async (f, i) => {
      if (i >= ALTERNATIVE_TITLE_LIMIT) return f;
      const all = [...f.names, ...(await alternativeTitles(f.id))];
      return { ...f, names: all, score: nameScore(names, all) };
    }),
  );
}

function best(found: Found[]): Found | undefined {
  return found
    .filter((f) => f.score >= MIN_NAME_SCORE)
    .sort((a, b) => b.score - a.score)[0];
}

function latestOfNearBest(found: Found[]): Found | undefined {
  const top = best(found);
  if (!top) return undefined;
  return found
    .filter(
      (f) => f.score >= MIN_NAME_SCORE && f.score >= top.score - NEAR_BEST,
    )
    .sort((a, b) => b.date - a.date)[0];
}

interface SeasonPick {
  season: number;
  detail: TmdbSeason;
}

function airedBefore(detail: TmdbSeason, start: number): number {
  return detail.episodes.filter((e) => {
    const aired = dayOf(e.air_date);
    return aired !== null && aired < start;
  }).length;
}

// MAL starts a new entry for each season and often for each half of one, while TMDB keeps both
// halves in one season.
async function pickSeason(
  tmdb: TmdbClient,
  tvId: number,
  start: number,
): Promise<SeasonPick | null> {
  const show = await tmdb.tvDetail(tvId);
  const seasons = (show.seasons ?? []).flatMap((s) => {
    const aired = dayOf(s.air_date);
    return s.season_number > 0 && aired !== null
      ? [{ season: s.season_number, aired }]
      : [];
  });
  const near = seasons
    .filter((s) => Math.abs(s.aired - start) <= SEASON_WINDOW)
    .sort((a, b) => Math.abs(a.aired - start) - Math.abs(b.aired - start))[0];
  if (near) {
    return {
      season: near.season,
      detail: await tmdb.seasonDetail(tvId, near.season),
    };
  }
  const running = seasons
    .filter((s) => s.aired <= start)
    .sort((a, b) => b.aired - a.aired)[0];
  if (!running) return null;
  const detail = await tmdb.seasonDetail(tvId, running.season);
  const reaches = detail.episodes.some((e) => {
    const aired = dayOf(e.air_date);
    return aired !== null && Math.abs(aired - start) <= EPISODE_WINDOW;
  });
  return reaches ? { season: running.season, detail } : null;
}

function skipped(slug: string, reason: string): SyncOutcome {
  return { kind: 'skipped', skipped: { slug, reason } };
}

function matched(
  input: TitleInput,
  facts: MalFacts,
  found: Found,
  images: TmdbImages,
  scope: MatchScope,
  season: number | null,
  episodes: EpisodeArtRow[],
): SyncOutcome {
  const backdrop = pickBackdrop(images.backdrops);
  const poster = pickPoster(images.posters);
  return {
    kind: 'matched',
    matched: {
      slug: input.slug,
      tmdbKind: found.kind,
      tmdbId: found.id,
      probability: found.score,
      title: {
        source_slug: input.slug,
        tmdb_kind: found.kind,
        tmdb_id: found.id,
        tmdb_season: season,
        match_scope: scope,
        backdrop_path: backdrop?.path ?? null,
        backdrop_lang: backdrop?.lang ?? null,
        poster_path: poster?.path ?? null,
        poster_lang: poster?.lang ?? null,
        source_name: input.name,
        source_year: input.year ?? null,
        source_episode_count: input.episodeCount ?? null,
        matched_by: 'mal',
        source_mal_id: facts.malId,
      },
      episodes,
    },
  };
}

async function findMovie(
  input: TitleInput,
  facts: MalFacts,
  start: number,
  tmdb: TmdbClient,
): Promise<SyncOutcome> {
  const names = scoringNames(facts);
  const found = await search(
    malQueries(searchNames(facts), false),
    names,
    async (query) =>
      (await tmdb.searchMovie(query)).flatMap((m) => {
        const released = dayOf(m.release_date);
        return m.genre_ids.includes(ANIMATION_GENRE) &&
          released !== null &&
          Math.abs(yearOf(released) - yearOf(start)) <= MOVIE_YEAR_SLACK
          ? [
              {
                kind: 'movie' as const,
                id: m.id,
                names: [m.title, m.original_title],
                date: released,
              },
            ]
          : [];
      }),
    (id) => tmdb.movieAlternativeTitles(id),
  );
  const movie = best(found);
  if (!movie) {
    return skipped(
      input.slug,
      `no TMDB movie for MAL ${facts.mediaType} ${facts.malId}`,
    );
  }
  const images = await tmdb.movieImages(movie.id);
  return matched(input, facts, movie, images, 'show', null, []);
}

async function findSeries(
  input: TitleInput,
  facts: MalFacts,
  start: number,
  tmdb: TmdbClient,
): Promise<SyncOutcome> {
  const names = scoringNames(facts);
  const found = await search(
    malQueries(searchNames(facts), true),
    names,
    async (query) =>
      (await tmdb.searchTv(query)).flatMap((r) => {
        const aired = dayOf(r.first_air_date);
        return r.genre_ids.includes(ANIMATION_GENRE) &&
          aired !== null &&
          aired <= start + AIRS_AFTER_SLACK
          ? [
              {
                kind: 'tv' as const,
                id: r.id,
                names: [r.name, r.original_name],
                date: aired,
              },
            ]
          : [];
      }),
    (id) => tmdb.tvAlternativeTitles(id),
  );
  const show = latestOfNearBest(found);
  if (!show) {
    return skipped(
      input.slug,
      `no TMDB show for MAL ${facts.mediaType} ${facts.malId}`,
    );
  }
  const [images, picked] = await Promise.all([
    tmdb.tvImages(show.id),
    pickSeason(tmdb, show.id, start),
  ]);
  if (!picked) return matched(input, facts, show, images, 'show', null, []);
  const episodes = mapEpisodes(
    input.slug,
    picked.detail.episodes,
    -airedBefore(picked.detail, start),
    input.episodeCount ?? facts.episodes ?? undefined,
  );
  return matched(input, facts, show, images, 'season', picked.season, episodes);
}

export async function findFromMal(
  input: TitleInput,
  facts: MalFacts,
  tmdb: TmdbClient,
): Promise<SyncOutcome> {
  const start = dayOf(facts.startDate);
  if (start === null) {
    return skipped(input.slug, `MAL ${facts.malId} has no start date`);
  }
  return isSeries(facts)
    ? findSeries(input, facts, start, tmdb)
    : findMovie(input, facts, start, tmdb);
}
