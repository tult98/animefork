import {
  LIST_PAGE_SIZE,
  parseEpisodeList,
  parseSynopsis,
  type ListedEpisode,
} from './episode.parser.ts';
import { createRateLimiter, type RateLimiter } from './episode.limiter.ts';

export const MAL_SITE = 'https://myanimelist.net';
// MAL serves this identifiable agent the same pages as a browser.
export const EPISODE_USER_AGENT =
  'Mozilla/5.0 (compatible; animefork-episode-sync/1.0)';
export const DEFAULT_GAP_MS = 1000;
export const DEFAULT_RETRY_MS = 5000;
const DEFAULT_TIMEOUT_MS = 15_000;
// A full-length series is a dozen pages of 100. This stops a page that never runs out.
const MAX_LIST_PAGES = 50;

export class EpisodeSiteError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EpisodeSiteError';
    this.status = status;
  }
}

export interface EpisodeSiteClient {
  // Every listed episode of one MAL entry, or null when MAL has no such entry.
  list(malId: number): Promise<ListedEpisode[] | null>;
  // The synopsis of one episode, or null while it has none.
  synopsis(malId: number, episode: number): Promise<string | null>;
}

export interface EpisodeSiteOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  gapMs?: number;
  // Shared by every client in the process so their requests to MAL stay one gap apart. Wins over `gapMs`.
  limiter?: RateLimiter;
  retryMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createEpisodeSiteClient(
  options: EpisodeSiteOptions = {},
): EpisodeSiteClient {
  const base = (options.baseUrl ?? MAL_SITE).replace(/\/+$/, '');
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
        headers: { 'user-agent': EPISODE_USER_AGENT, accept: 'text/html' },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (cause) {
      throw new EpisodeSiteError(
        `MAL page could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  // One retry after a pause, only for a rate limit or a server error.
  async function page(path: string): Promise<string | null> {
    const url = `${base}${path}`;
    let res = await request(url);
    if (res.status === 429 || res.status >= 500) {
      void res.body?.cancel().catch(() => undefined);
      await sleep(retryMs);
      res = await request(url);
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new EpisodeSiteError(
        `MAL ${path} answered ${res.status}`,
        res.status,
      );
    }
    return res.text();
  }

  return {
    async list(malId) {
      const episodes: ListedEpisode[] = [];
      for (let pageNo = 0; pageNo < MAX_LIST_PAGES; pageNo++) {
        const offset = pageNo * LIST_PAGE_SIZE;
        const query = offset > 0 ? `?offset=${offset}` : '';
        const html = await page(`/anime/${malId}/x/episode${query}`);
        if (html === null) return pageNo === 0 ? null : episodes;
        const listed = parseEpisodeList(html);
        episodes.push(...listed);
        if (listed.length < LIST_PAGE_SIZE) break;
      }
      return episodes;
    },
    async synopsis(malId, episode) {
      const html = await page(`/anime/${malId}/x/episode/${episode}`);
      return html === null ? null : parseSynopsis(html);
    },
  };
}
