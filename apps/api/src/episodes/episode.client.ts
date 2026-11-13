import { z } from 'zod';
import { DEFAULT_TENRAI_API } from '../mal/mal.config.ts';
import { createRateLimiter, type RateLimiter } from './episode.limiter.ts';

export const DEFAULT_GAP_MS = 1000;
export const DEFAULT_RETRY_MS = 5000;
const DEFAULT_TIMEOUT_MS = 15_000;
// Tenrai pages hold 100 episodes. This stops a list that never runs out.
const MAX_LIST_PAGES = 50;
// A Retry-After longer than this is not worth holding every queued read for.
export const MAX_RETRY_AFTER_MS = 60_000;

export interface ListedEpisode {
  number: number;
  title: string;
  titleAlt: string | null;
  // ISO date, or null when MAL lists none.
  aired: string | null;
  // The English synopsis without its "(Source: ...)" credit, or null when there is none.
  synopsis: string | null;
}

export class EpisodeSiteError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EpisodeSiteError';
    this.status = status;
  }
}

export interface EpisodeSiteClient {
  // Every listed episode of one MAL entry, or null when Tenrai has no such entry. Throws when the answer is not
  // an episode list, so an error page is never read as an empty list.
  list(malId: number): Promise<ListedEpisode[] | null>;
}

export type EpisodeLister = Pick<EpisodeSiteClient, 'list'>;

export interface EpisodeSiteOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  gapMs?: number;
  // Shared by every client in the process so their requests stay one gap apart. Wins over `gapMs`.
  limiter?: RateLimiter;
  retryMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

// Tenrai serves Jikan v4's shape.
const PageSchema = z.object({
  pagination: z.object({ has_next_page: z.boolean() }),
  data: z.array(
    z.object({
      mal_id: z.number().int(),
      title: z.string().nullish(),
      title_romanji: z.string().nullish(),
      aired: z.string().nullish(),
      synopsis: z.string().nullish(),
    }),
  ),
});

// MAL ends a synopsis with its credit, such as "(Source: Crunchyroll)" or "[Written by MAL Rewrite]".
export function cleanSynopsis(text: string | null | undefined): string | null {
  const cleaned = (text ?? '')
    .replace(/\s*[([](?:Source|Written by)[^)\]]*[)\]]\s*$/i, '')
    .trim();
  return cleaned || null;
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  const seconds = Number(header);
  if (!header || !Number.isFinite(seconds)) return null;
  return Math.min(Math.max(seconds, 0) * 1000, MAX_RETRY_AFTER_MS);
}

export function createEpisodeSiteClient(
  options: EpisodeSiteOptions = {},
): EpisodeSiteClient {
  const base = (options.baseUrl ?? DEFAULT_TENRAI_API).replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const limiter =
    options.limiter ??
    createRateLimiter({
      gapMs: options.gapMs ?? DEFAULT_GAP_MS,
      now: options.now,
      sleep,
    });

  async function request(url: string): Promise<Response> {
    await limiter.wait();
    try {
      return await doFetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (cause) {
      throw new EpisodeSiteError(
        `Tenrai could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  // One retry, only for a rate limit or a server error. A 429 pauses the shared limiter so queued reads wait too.
  async function page(path: string): Promise<unknown | null> {
    const url = `${base}${path}`;
    let res = await request(url);
    if (res.status === 429 || res.status >= 500) {
      void res.body?.cancel().catch(() => undefined);
      if (res.status === 429) {
        limiter.pause(retryAfterMs(res) ?? retryMs);
      } else {
        await sleep(retryMs);
      }
      res = await request(url);
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new EpisodeSiteError(
        `Tenrai ${path} answered ${res.status}`,
        res.status,
      );
    }
    try {
      return await res.json();
    } catch {
      throw new EpisodeSiteError(`Tenrai ${path} did not answer JSON`);
    }
  }

  return {
    async list(malId) {
      const episodes: ListedEpisode[] = [];
      for (let pageNo = 1; pageNo <= MAX_LIST_PAGES; pageNo++) {
        const path = `/anime/${malId}/episodes?page=${pageNo}`;
        const body = await page(path);
        if (body === null) return pageNo === 1 ? null : episodes;
        const parsed = PageSchema.safeParse(body);
        if (!parsed.success) {
          throw new EpisodeSiteError(`Tenrai ${path} is not an episode list`);
        }
        for (const e of parsed.data.data) {
          const title = e.title?.trim();
          if (e.mal_id < 1 || !title) continue;
          episodes.push({
            number: e.mal_id,
            title,
            titleAlt: e.title_romanji?.trim() || null,
            aired: e.aired?.slice(0, 10) || null,
            synopsis: cleanSynopsis(e.synopsis),
          });
        }
        if (!parsed.data.pagination.has_next_page) break;
      }
      return episodes;
    },
  };
}
