import {
  BACKDROP_SIZE,
  CARD_BACKDROP_SIZE,
  LOOKUP_PATH,
  LookupResponseSchema,
  MAX_TITLES_PER_LOOKUP,
  POSTER_SIZE,
  tmdbImageUrl,
  type ArtEntry,
  type ImageSize,
  type TitleInput,
  type TitleRatings,
} from '../../../../api/src/art/contract.ts';
import { titleWatchLink } from './link.ts';
import { arrangeUpcoming, UPCOMING_MIN_TITLES, type Shelf } from './shelves.ts';
import type { Title } from './title.ts';
import type { WatchPage } from './watch.ts';

export interface ArtEnv {
  VITE_API_URL?: string;
}

export interface TitleArt {
  backdrop?: string;
  pending: boolean;
}

export interface HomeArtPaths {
  backdropPath: string | null;
  posterPath: string | null;
  overview: string | null;
}

export interface HomeArt {
  paths: Map<string, HomeArtPaths>;
  ratings: Map<string, TitleRatings>;
  avsStale: string[];
  pending: boolean;
  // The slugs this answer speaks for, a failed lookup included, and the ones it left pending.
  answered: Set<string>;
  pendingSlugs: Set<string>;
}

export const NO_ART: TitleArt = { pending: false };

const TIMEOUT_MS = 3000;

export const ART_POLL_DELAYS_MS = [3000, 6000, 12000];

export function artPollDelay(
  pending: boolean | undefined,
  fetches: number,
): number | false {
  if (!pending) return false;
  return ART_POLL_DELAYS_MS[fetches - 1] ?? false;
}

// How long a card may sit on a skeleton: the first answer plus one poll. After that it shows the source image,
// and later polls still swap in the TMDB art when it lands.
export const ART_SKELETON_FETCHES = 1;

export function artSkeletonLeft(fetches: number): boolean {
  return fetches <= ART_SKELETON_FETCHES;
}

type ReadyEntry = Extract<ArtEntry, { status: 'ready' }>;

interface LookupResult {
  ready: Map<string, ReadyEntry>;
  ratings: Map<string, TitleRatings>;
  avsStale: string[];
  pending: boolean;
  answered: Set<string>;
  pendingSlugs: Set<string>;
}

const EMPTY_LOOKUP: LookupResult = {
  ready: new Map(),
  ratings: new Map(),
  avsStale: [],
  pending: false,
  answered: new Set(),
  pendingSlugs: new Set(),
};

async function lookupChunk(
  url: string,
  titles: TitleInput[],
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<LookupResult> {
  const res = await fetchImpl(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ titles }),
  });
  if (!res.ok) throw new Error(`art lookup answered ${res.status}`);
  const { art, ratings, avsStale, ratingsPending } = LookupResponseSchema.parse(
    await res.json(),
  );
  const ready = new Map<string, ReadyEntry>();
  // A MyAnimeList lookup still being filled asks the page to come back, just like pending art.
  let pending = ratingsPending === true;
  const pendingSlugs = new Set<string>();
  for (const [slug, entry] of Object.entries(art)) {
    if (entry.status === 'ready') ready.set(slug, entry);
    else if (entry.status === 'pending') {
      pending = true;
      pendingSlugs.add(slug);
    }
  }
  return {
    ready,
    ratings: new Map(Object.entries(ratings ?? {})),
    avsStale: avsStale ?? [],
    pending,
    answered: new Set(),
    pendingSlugs,
  };
}

async function lookupArt(
  titles: TitleInput[],
  options: {
    env: ArtEnv;
    signal?: AbortSignal;
    fetch?: typeof fetch;
  },
): Promise<LookupResult> {
  const base = options.env.VITE_API_URL?.replace(/\/+$/, '');
  if (!base || titles.length === 0) return EMPTY_LOOKUP;
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
          signal,
          options.fetch ?? fetch,
        ),
      ),
    );
    return {
      ready: new Map(results.flatMap((r) => [...r.ready])),
      ratings: new Map(results.flatMap((r) => [...r.ratings])),
      avsStale: results.flatMap((r) => r.avsStale),
      pending: results.some((r) => r.pending),
      answered: new Set(titles.map((t) => t.slug)),
      pendingSlugs: new Set(results.flatMap((r) => [...r.pendingSlugs])),
    };
  } catch {
    // A failed lookup is an answer too: the cards stop waiting and keep the source image.
    return { ...EMPTY_LOOKUP, answered: new Set(titles.map((t) => t.slug)) };
  }
}

export async function fetchArt(
  title: TitleInput,
  options: { env: ArtEnv; signal?: AbortSignal; fetch?: typeof fetch },
): Promise<TitleArt> {
  const { ready, pending } = await lookupArt([title], options);
  const entry = ready.get(title.slug);
  if (!entry) return pending ? { ...NO_ART, pending } : NO_ART;
  return {
    backdrop: entry.backdropPath
      ? tmdbImageUrl(entry.backdropPath, BACKDROP_SIZE)
      : undefined,
    pending: false,
  };
}

export function applyArt(page: WatchPage, art: TitleArt): WatchPage {
  return art.backdrop ? { ...page, image: art.backdrop } : page;
}

export async function fetchHomeArt(
  titles: TitleInput[],
  options: { env: ArtEnv; signal?: AbortSignal; fetch?: typeof fetch },
): Promise<HomeArt> {
  const { ready, ratings, avsStale, pending, answered, pendingSlugs } =
    await lookupArt(titles, options);
  const paths = new Map<string, HomeArtPaths>();
  for (const [slug, entry] of ready) {
    const overview = entry.overview ?? null;
    if (entry.backdropPath || entry.posterPath || overview) {
      paths.set(slug, {
        backdropPath: entry.backdropPath,
        posterPath: entry.posterPath,
        overview,
      });
    }
  }
  return { paths, ratings, avsStale, pending, answered, pendingSlugs };
}

function slugOf(title: Pick<Title, 'path'>): string {
  return titleWatchLink(title).params.slug;
}

export function applyHomeArt<S extends Shelf>(
  shelves: S[],
  art: Map<string, HomeArtPaths>,
): S[] {
  if (art.size === 0) return shelves;
  // The card's own description is cut short with "...", so the stored overview replaces it.
  const withOverview = <T extends Title>(title: T): T => {
    const overview = art.get(slugOf(title))?.overview;
    return overview ? { ...title, description: overview } : title;
  };
  const withBackdrop = (title: Title, size: ImageSize): Title => {
    const path = art.get(slugOf(title))?.backdropPath;
    return withOverview(
      path ? { ...title, image: tmdbImageUrl(path, size) } : title,
    );
  };
  return shelves.map((shelf) => {
    if (shelf.kind === 'continue') return shelf;
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
        const paths = art.get(slugOf(t));
        if (!paths) return t;
        const { backdropPath, posterPath } = paths;
        return {
          ...withOverview(t),
          ...(posterPath && { image: tmdbImageUrl(posterPath, POSTER_SIZE) }),
          ...(backdropPath && {
            backdrop: tmdbImageUrl(backdropPath, CARD_BACKDROP_SIZE),
          }),
        };
      }),
    };
  }) as S[];
}

export interface ArtWait {
  apiOn: boolean;
  art: HomeArt | undefined;
  // False once the poll budget is spent, so a title still pending then shows its source image.
  pollsLeft: boolean;
  failed?: boolean;
  // The slugs sent for lookup. One left out (the API refused its shape) is never answered, so it must not wait.
  sent?: Set<string>;
}

// A slug the answer in hand does not cover counts as waiting, so a list that grows never flashes the source image.
export function isWaitingForArt(slug: string, wait: ArtWait): boolean {
  if (!wait.apiOn || wait.failed) return false;
  if (wait.sent && !wait.sent.has(slug)) return false;
  if (!wait.art?.answered.has(slug)) return true;
  return wait.art.pendingSlugs.has(slug) && wait.pollsLeft;
}

export function markArtPending<S extends Shelf>(
  shelves: S[],
  wait: ArtWait,
): S[] {
  if (!wait.apiOn || wait.failed) return shelves;
  const mark = <T extends Title>(title: T): T =>
    isWaitingForArt(slugOf(title), wait)
      ? { ...title, artPending: true }
      : title;
  return shelves.map((shelf) =>
    shelf.kind === 'continue'
      ? shelf
      : { ...shelf, items: shelf.items.map(mark) },
  ) as S[];
}

function withRatings(title: Title, ratings: Map<string, TitleRatings>): Title {
  const found = ratings.get(slugOf(title));
  // The card's own count is read from the page just loaded, so it beats what the API stored earlier.
  const avsVoters = title.avsVoters ?? found?.avs?.voters;
  const quality = title.quality ?? found?.quality;
  const mal = found?.mal;
  if (avsVoters === undefined && !quality && !mal) return title;
  return {
    ...title,
    ...(avsVoters !== undefined && { avsVoters }),
    ...(quality && { quality }),
    ...(mal && { mal }),
  };
}

// MyAnimeList can date a title that the page only gave a year, so the upcoming shelf is arranged again.
export function applyRatings<S extends Shelf>(
  shelves: S[],
  ratings: Map<string, TitleRatings>,
  now: number = Date.now(),
): S[] {
  if (ratings.size === 0) return shelves;
  return shelves.flatMap((shelf) => {
    if (shelf.kind === 'continue') {
      const items = shelf.items.map((item) => {
        const mal = ratings.get(item.slug)?.mal;
        return mal ? { ...item, mal } : item;
      });
      return [{ ...shelf, items } as S];
    }
    const items = shelf.items.map((t) => withRatings(t, ratings));
    if (shelf.id !== 'upcoming') return [{ ...shelf, items }];
    const upcoming = arrangeUpcoming(items, now);
    return upcoming.length >= UPCOMING_MIN_TITLES
      ? [{ ...shelf, items: upcoming }]
      : [];
  }) as S[];
}
