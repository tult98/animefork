import { z } from 'zod';
import { createJikanLimiter, type JikanLimiter } from './jikan.limiter.ts';

export interface ListedEpisode {
  number: number;
  title: string;
  titleAlt: string | null;
  // ISO date, or null when Jikan lists none.
  aired: string | null;
}

export const JIKAN_API = 'https://api.jikan.moe/v4';
export const JIKAN_USER_AGENT =
  'Mozilla/5.0 (compatible; animefork-episode-sync/1.0)';
const DEFAULT_TIMEOUT_MS = 15_000;
// A full-length series is a dozen pages of 100. This stops a list that never runs out.
const MAX_LIST_PAGES = 50;
// Waits before the first and second retry of a 429 that names no Retry-After.
export const JIKAN_BACKOFF_MS = [5_000, 15_000] as const;
// A Retry-After longer than this is not worth holding the whole queue for.
export const JIKAN_MAX_RETRY_AFTER_MS = 60_000;

export class JikanError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'JikanError';
    this.status = status;
  }
}

export interface EpisodeListClient {
  // Every listed episode of one MAL entry, or null when Jikan has no such entry.
  list(malId: number): Promise<ListedEpisode[] | null>;
}

const nullable = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || null);

const PageSchema = z.object({
  pagination: z.object({ has_next_page: z.boolean().nullish() }),
  data: z.array(
    z.object({
      mal_id: z.number().int(),
      title: nullable,
      title_japanese: nullable,
      title_romanji: nullable,
      aired: nullable,
    }),
  ),
});

function isoDate(aired: string | null): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(aired ?? '');
  if (!day) return null;
  const date = new Date(`${day[0]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day[0]
    ? null
    : day[0];
}

function retryAfterMs(res: Response): number | null {
  const seconds = Number(res.headers.get('retry-after'));
  if (!res.headers.get('retry-after') || !Number.isFinite(seconds)) return null;
  return Math.min(Math.max(seconds, 0) * 1000, JIKAN_MAX_RETRY_AFTER_MS);
}

export interface JikanOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  // Shared by every client in the process so all Jikan calls count against one quota.
  limiter?: JikanLimiter;
  timeoutMs?: number;
}

export function createJikanClient(
  options: JikanOptions = {},
): EpisodeListClient {
  const base = (options.baseUrl ?? JIKAN_API).replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  const limiter = options.limiter ?? createJikanLimiter();
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request(url: string): Promise<Response> {
    await limiter.wait();
    try {
      return await doFetch(url, {
        headers: { 'user-agent': JIKAN_USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (cause) {
      throw new JikanError(
        `Jikan could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  // A 429 pauses the shared limiter, so queued calls wait out the same window, then retries up to twice.
  async function page(malId: number, pageNo: number) {
    const url = `${base}/anime/${malId}/episodes?page=${pageNo}`;
    for (let attempt = 0; ; attempt++) {
      const res = await request(url);
      if (res.status === 429 && attempt < JIKAN_BACKOFF_MS.length) {
        void res.body?.cancel().catch(() => undefined);
        limiter.pause(retryAfterMs(res) ?? JIKAN_BACKOFF_MS[attempt] ?? 0);
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new JikanError(
          `Jikan /anime/${malId}/episodes answered ${res.status}`,
          res.status,
        );
      }
      return PageSchema.parse(await res.json());
    }
  }

  return {
    async list(malId) {
      const episodes: ListedEpisode[] = [];
      for (let pageNo = 1; pageNo <= MAX_LIST_PAGES; pageNo++) {
        const body = await page(malId, pageNo);
        if (body === null) return pageNo === 1 ? null : episodes;
        for (const e of body.data) {
          const title = e.title ?? e.title_romanji ?? e.title_japanese;
          if (e.mal_id < 1 || !title) continue;
          const alt = e.title_romanji ?? e.title_japanese;
          episodes.push({
            number: e.mal_id,
            title,
            titleAlt: alt && alt !== title ? alt : null,
            aired: isoDate(e.aired),
          });
        }
        if (!body.pagination.has_next_page) break;
      }
      return episodes;
    },
  };
}
