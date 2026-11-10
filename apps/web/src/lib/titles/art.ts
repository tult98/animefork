import { z } from 'zod';
import {
  BACKDROP_SIZE,
  EPISODE_ART_TABLE,
  EpisodeArtRowSchema,
  STILL_SIZE,
  TITLE_ART_TABLE,
  TitleArtRowSchema,
  tmdbImageUrl,
} from '../../../../../tools/art-sync/src/schema.ts';
import type { Episode, WatchPage } from './watch.ts';

export interface ArtEnv {
  VITE_ART_API_URL?: string;
  VITE_ART_API_KEY?: string;
}

export interface TitleArt {
  backdrop?: string;
  stills: Map<number, string>;
}

export const NO_ART: TitleArt = { stills: new Map() };

const TIMEOUT_MS = 3000;

async function select<T>(
  base: string,
  key: string | undefined,
  table: string,
  slug: string,
  columns: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<T[]> {
  const url = `${base}/${table}?source_slug=eq.${encodeURIComponent(slug)}&select=${columns}`;
  const res = await fetchImpl(url, {
    signal,
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
  if (!res.ok) throw new Error(`${table} answered ${res.status}`);
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) throw new Error(`${table} did not answer a list`);
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function fetchArt(
  slug: string,
  options: {
    env: ArtEnv;
    signal?: AbortSignal;
    fetch?: typeof fetch;
  },
): Promise<TitleArt> {
  const base = options.env.VITE_ART_API_URL?.replace(/\/+$/, '');
  const key = options.env.VITE_ART_API_KEY;
  if (!base) return NO_ART;
  const fetchImpl = options.fetch ?? fetch;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  try {
    const [titles, episodes] = await Promise.all([
      select(
        base,
        key,
        TITLE_ART_TABLE,
        slug,
        'source_slug,tmdb_id,tmdb_season,backdrop_path,backdrop_lang',
        TitleArtRowSchema,
        signal,
        fetchImpl,
      ),
      select(
        base,
        key,
        EPISODE_ART_TABLE,
        slug,
        'source_slug,episode_number,still_path',
        EpisodeArtRowSchema,
        signal,
        fetchImpl,
      ),
    ]);
    const backdropPath = titles[0]?.backdrop_path;
    return {
      backdrop: backdropPath
        ? tmdbImageUrl(backdropPath, BACKDROP_SIZE)
        : undefined,
      stills: new Map(
        episodes.map((row) => [
          row.episode_number,
          tmdbImageUrl(row.still_path, STILL_SIZE),
        ]),
      ),
    };
  } catch {
    return NO_ART;
  }
}

function episodeNumber(label: string): number | undefined {
  const match = /^Tập (\d+)(?![\d.])/.exec(label);
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
}

export function applyArt(page: WatchPage, art: TitleArt): WatchPage {
  if (!art.backdrop && art.stills.size === 0) return page;
  const withStill = (episode: Episode): Episode => {
    const number = episodeNumber(episode.label);
    const still = number === undefined ? undefined : art.stills.get(number);
    return still ? { ...episode, thumbnail: still } : episode;
  };
  const episodes = page.episodes.map(withStill);
  return {
    ...page,
    image: art.backdrop ?? page.image,
    episodes,
    currentEpisode:
      episodes.find((e) => e.id === page.currentEpisode.id) ??
      page.currentEpisode,
  };
}
