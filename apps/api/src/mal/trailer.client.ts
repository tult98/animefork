import { z } from 'zod';
import { DEFAULT_TENRAI_API } from './mal.config.ts';

export interface TrailerClient {
  // The YouTube id of the title's promo video, or null when it has none or the lookup failed.
  youtubeId(malId: number): Promise<string | null>;
}

export interface TrailerClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

// Tenrai serves Jikan v4's shape; only the trailer matters here.
const FullSchema = z.object({
  data: z.object({
    trailer: z.object({ youtube_id: z.string().min(1).nullish() }).nullish(),
  }),
});

export function createTrailerClient(
  options: TrailerClientOptions = {},
): TrailerClient {
  const base = (options.baseUrl ?? DEFAULT_TENRAI_API).replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    // Tenrai is blocked on some networks and a video is optional, so no failure is worth surfacing.
    async youtubeId(malId) {
      try {
        const res = await doFetch(`${base}/anime/${malId}/full`, {
          signal: AbortSignal.timeout(timeout),
        });
        if (!res.ok) return null;
        const parsed = FullSchema.safeParse(await res.json());
        return parsed.success
          ? (parsed.data.data.trailer?.youtube_id ?? null)
          : null;
      } catch {
        return null;
      }
    },
  };
}
