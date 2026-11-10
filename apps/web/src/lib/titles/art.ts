import {
  BACKDROP_SIZE,
  CARD_BACKDROP_SIZE,
  LOOKUP_PATH,
  LookupResponseSchema,
  MAX_TITLES_PER_LOOKUP,
  STILL_SIZE,
  tmdbImageUrl,
  type ArtEntry,
  type ImageSize,
  type TitleInput,
} from '../../../../api/src/art/contract.ts';
import { titleWatchLink } from './link.ts';
import type { HomeShelves } from './shelves.ts';
import type { Title } from './title.ts';
import type { Episode, WatchPage } from './watch.ts';

export interface ArtEnv {
  VITE_API_URL?: string;
}

export interface TitleArt {
  backdrop?: string;
  stills: Map<number, string>;
  pending: boolean;
}

export interface HomeArt {
  backdrops: Map<string, string>;
  pending: boolean;
}

export const NO_ART: TitleArt = { stills: new Map(), pending: false };

const TIMEOUT_MS = 3000;

export const ART_POLL_DELAYS_MS = [3000, 6000, 12000];

export function artPollDelay(
  pending: boolean | undefined,
  fetches: number,
): number | false {
  if (!pending) return false;
  return ART_POLL_DELAYS_MS[fetches - 1] ?? false;
}

type ReadyEntry = Extract<ArtEntry, { status: 'ready' }>;

interface LookupResult {
  ready: Map<string, ReadyEntry>;
  pending: boolean;
}

async function lookupChunk(
  url: string,
  titles: TitleInput[],
  episodes: boolean,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<LookupResult> {
  const res = await fetchImpl(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(episodes ? { titles, episodes } : { titles }),
  });
  if (!res.ok) throw new Error(`art lookup answered ${res.status}`);
  const { art } = LookupResponseSchema.parse(await res.json());
  const ready = new Map<string, ReadyEntry>();
  let pending = false;
  for (const [slug, entry] of Object.entries(art)) {
    if (entry.status === 'ready') ready.set(slug, entry);
    else if (entry.status === 'pending') pending = true;
  }
  return { ready, pending };
}

async function lookupArt(
  titles: TitleInput[],
  options: {
    env: ArtEnv;
    episodes?: boolean;
    signal?: AbortSignal;
    fetch?: typeof fetch;
  },
): Promise<LookupResult> {
  const base = options.env.VITE_API_URL?.replace(/\/+$/, '');
  if (!base || titles.length === 0) return { ready: new Map(), pending: false };
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  const chunks: TitleInput[][] = [];
  for (let i = 0; i < titles.length; i += MAX_TITLES_PER_LOOKUP) {
    chunks.push(titles.slice(i, i + MAX_TITLES_PER_LOOKUP));
  }
  try {
    const results = await Promise.all(
      chunks.map((chunk) =>
        lookupChunk(
          `${base}${LOOKUP_PATH}`,
          chunk,
          options.episodes ?? false,
          signal,
          options.fetch ?? fetch,
        ),
      ),
    );
    return {
      ready: new Map(results.flatMap((r) => [...r.ready])),
      pending: results.some((r) => r.pending),
    };
  } catch {
    return { ready: new Map(), pending: false };
  }
}

export async function fetchArt(
  title: TitleInput,
  options: { env: ArtEnv; signal?: AbortSignal; fetch?: typeof fetch },
): Promise<TitleArt> {
  const { ready, pending } = await lookupArt([title], {
    ...options,
    episodes: true,
  });
  const entry = ready.get(title.slug);
  if (!entry) return pending ? { ...NO_ART, pending } : NO_ART;
  return {
    backdrop: entry.backdropPath
      ? tmdbImageUrl(entry.backdropPath, BACKDROP_SIZE)
      : undefined,
    stills: new Map(
      Object.entries(entry.stills ?? {}).map(([n, path]) => [
        Number.parseInt(n, 10),
        tmdbImageUrl(path, STILL_SIZE),
      ]),
    ),
    pending: false,
  };
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

export async function fetchBackdrops(
  titles: TitleInput[],
  options: { env: ArtEnv; signal?: AbortSignal; fetch?: typeof fetch },
): Promise<HomeArt> {
  const { ready, pending } = await lookupArt(titles, options);
  const backdrops = new Map<string, string>();
  for (const [slug, entry] of ready) {
    if (entry.backdropPath) backdrops.set(slug, entry.backdropPath);
  }
  return { backdrops, pending };
}

function slugOf(title: Pick<Title, 'path'>): string {
  return titleWatchLink(title).params.slug;
}

export function applyHomeArt(
  shelves: HomeShelves,
  backdrops: Map<string, string>,
): HomeShelves {
  if (backdrops.size === 0) return shelves;
  const withBackdrop = (title: Title, size: ImageSize): Title => {
    const path = backdrops.get(slugOf(title));
    return path ? { ...title, image: tmdbImageUrl(path, size) } : title;
  };
  return shelves.map((shelf) => {
    if (shelf.kind === 'hero') {
      return {
        ...shelf,
        items: shelf.items.map((t) => withBackdrop(t, BACKDROP_SIZE)),
      };
    }
    if (shelf.kind === 'default') {
      return {
        ...shelf,
        items: shelf.items.map((t) => withBackdrop(t, CARD_BACKDROP_SIZE)),
      };
    }
    return {
      ...shelf,
      items: shelf.items.map((t) => {
        const path = backdrops.get(slugOf(t));
        return path
          ? { ...t, backdrop: tmdbImageUrl(path, CARD_BACKDROP_SIZE) }
          : t;
      }),
    };
  });
}
