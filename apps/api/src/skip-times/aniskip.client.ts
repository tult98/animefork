import { z } from 'zod';
import type { SkipSegment } from './contract.ts';

export const DEFAULT_ANISKIP_API = 'https://api.aniskip.com/v2';
const DEFAULT_TIMEOUT_MS = 5000;

export class AniskipError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AniskipError';
    this.status = status;
  }
}

export interface AniskipClient {
  skipTimes(malId: number, episode: number): Promise<SkipSegment[]>;
}

const ResultSchema = z.object({
  interval: z.object({ startTime: z.number(), endTime: z.number() }),
  skipType: z.string(),
});

const ResponseSchema = z.object({ results: z.array(z.unknown()) });

const KIND_BY_SKIP_TYPE: Partial<Record<string, SkipSegment['kind']>> = {
  op: 'intro',
  'mixed-op': 'intro',
  ed: 'outro',
  'mixed-ed': 'outro',
};

export function toSegments(results: readonly unknown[]): SkipSegment[] {
  const segments: SkipSegment[] = [];
  for (const raw of results) {
    const parsed = ResultSchema.safeParse(raw);
    if (!parsed.success) continue;
    const kind = KIND_BY_SKIP_TYPE[parsed.data.skipType];
    const { startTime, endTime } = parsed.data.interval;
    if (!kind || startTime < 0 || endTime <= startTime) continue;
    segments.push({ kind, startS: startTime, endS: endTime });
  }
  return segments.sort((a, b) => a.startS - b.startS);
}

export interface AniskipClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createAniskipClient(
  options: AniskipClientOptions = {},
): AniskipClient {
  const base = (options.baseUrl ?? DEFAULT_ANISKIP_API).replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async skipTimes(malId, episode) {
      const url = new URL(`${base}/skip-times/${malId}/${episode}`);
      url.searchParams.append('types', 'op');
      url.searchParams.append('types', 'ed');
      url.searchParams.set('episodeLength', '0');
      let res: Response;
      try {
        res = await doFetch(url, { signal: AbortSignal.timeout(timeout) });
      } catch (cause) {
        throw new AniskipError(
          `AniSkip could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
      if (res.status === 404) return [];
      if (!res.ok) {
        throw new AniskipError(`AniSkip answered ${res.status}`, res.status);
      }
      try {
        return toSegments(ResponseSchema.parse(await res.json()).results);
      } catch (cause) {
        throw new AniskipError(
          `AniSkip answered an unreadable body: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    },
  };
}
