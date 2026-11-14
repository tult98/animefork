import { z } from 'zod';
import {
  MAL_START_DATE_PATTERN,
  MalAiringSchema,
  MalSeasonSchema,
  type MalStats,
} from '../art/contract.ts';
import { DEFAULT_MAL_API } from './mal.config.ts';

// What MAL itself reports; the trailer comes from another service.
export type MalCounts = Omit<MalStats, 'trailerYoutubeId'>;

export type { MalStats };

export const SEARCH_LIMIT = 10;
export const MIN_QUERY_LENGTH = 3;
// MAL answers 400 "invalid q" for a longer query.
export const MAX_QUERY_LENGTH = 64;
const FIELDS =
  'alternative_titles,start_season,num_episodes,media_type,mean,num_scoring_users,rank,popularity,num_list_users,status,start_date';
const STATS_FIELDS =
  'mean,num_scoring_users,rank,popularity,num_list_users,status,num_episodes,start_date,start_season';

export interface MalCandidate extends Omit<MalCounts, 'episodes'> {
  title: string;
  english: string | undefined;
  synonyms: string[];
  year: number | undefined;
  episodes: number | undefined;
  mediaType: string | undefined;
}

export interface MalRelation {
  id: number;
  relationType: string;
}

export interface MalEntry {
  candidate: MalCandidate;
  related: MalRelation[];
}

export class MalError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'MalError';
    this.status = status;
  }
}

export interface MalClient {
  search(query: string): Promise<MalCandidate[]>;
  stats(id: number): Promise<MalCounts | null>;
  entry(id: number): Promise<MalEntry | null>;
}

const NodeSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  alternative_titles: z
    .object({
      synonyms: z.array(z.string()).optional(),
      en: z.string().optional(),
    })
    .optional(),
  start_season: z
    .object({ year: z.number().int(), season: z.string().optional() })
    .optional(),
  start_date: z.string().optional(),
  num_episodes: z.number().int().optional(),
  media_type: z.string().optional(),
  mean: z.number().optional(),
  num_scoring_users: z.number().int().optional(),
  rank: z.number().int().optional(),
  popularity: z.number().int().optional(),
  num_list_users: z.number().int().optional(),
  status: z.string().optional(),
});

type Node = z.infer<typeof NodeSchema>;

const EntrySchema = NodeSchema.extend({
  related_anime: z
    .array(
      z.object({
        node: z.object({ id: z.number().int() }),
        relation_type: z.string(),
      }),
    )
    .optional(),
});

const SearchSchema = z.object({
  data: z.array(z.object({ node: z.unknown() })),
});

function toStartSeason(raw: Node['start_season']): MalCounts['startSeason'] {
  const season = MalSeasonSchema.safeParse(raw?.season).data;
  return raw && season ? { year: raw.year, season } : null;
}

function toStats(node: Node): MalCounts {
  return {
    id: node.id,
    score: node.mean ?? null,
    voters: node.num_scoring_users ?? null,
    rank: node.rank ?? null,
    popularity: node.popularity ?? null,
    members: node.num_list_users ?? null,
    // A status MAL adds later is read as unknown rather than failing the whole title.
    airing: MalAiringSchema.safeParse(node.status).data ?? null,
    // MAL reports 0 episodes for a show whose count is not known yet.
    episodes: node.num_episodes || null,
    startDate: MAL_START_DATE_PATTERN.test(node.start_date ?? '')
      ? (node.start_date ?? null)
      : null,
    startSeason: toStartSeason(node.start_season),
  };
}

function toCandidate(node: Node): MalCandidate {
  const english = node.alternative_titles?.en?.trim();
  return {
    ...toStats(node),
    title: node.title,
    english: english || undefined,
    synonyms: node.alternative_titles?.synonyms ?? [],
    year: node.start_season?.year,
    // MAL reports 0 episodes for a show whose count is not known yet.
    episodes: node.num_episodes || undefined,
    mediaType: node.media_type,
  };
}

// A long title is cut at a word boundary so the search still hits the start of the name.
export function fitQuery(query: string): string {
  const text = query.trim();
  if (text.length <= MAX_QUERY_LENGTH) return text;
  const cut = text.slice(0, MAX_QUERY_LENGTH);
  const space = cut.lastIndexOf(' ');
  return (space >= MIN_QUERY_LENGTH ? cut.slice(0, space) : cut).trim();
}

export interface MalClientOptions {
  clientId: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  // MAL publishes no rate limit, so calls are made one at a time with a gap between them.
  gapMs?: number;
  // After a 429 every call fails at once for this long instead of piling more load on MAL.
  cooldownMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_GAP_MS = 1000;
export const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 8000;

export function createMalClient(options: MalClientOptions): MalClient {
  const base = (options.baseUrl ?? DEFAULT_MAL_API).replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  const gap = options.gapMs ?? DEFAULT_GAP_MS;
  const cooldown = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let chain: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  let coolingUntil = 0;

  async function call(path: string, params: Record<string, string>) {
    if (now() < coolingUntil)
      throw new MalError('cooling down after a 429', 429);
    const wait = lastAt + gap - now();
    if (wait > 0) await sleep(wait);
    lastAt = now();
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { 'X-MAL-CLIENT-ID': options.clientId },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (cause) {
      throw new MalError(
        `MAL ${path} could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    if (res.status === 429) coolingUntil = now() + cooldown;
    return res;
  }

  // One call at a time, in order, whatever the caller does.
  function serial<T>(job: () => Promise<T>): Promise<T> {
    const run = chain.then(job, job);
    chain = run.catch(() => undefined);
    return run;
  }

  return {
    search: (query) =>
      serial(async () => {
        const res = await call('/anime', {
          q: fitQuery(query),
          limit: String(SEARCH_LIMIT),
          fields: FIELDS,
          // Without it MAL leaves out every entry it rates gray, such as ecchi shows.
          nsfw: 'true',
        });
        if (!res.ok)
          throw new MalError(`MAL /anime answered ${res.status}`, res.status);
        const { data } = SearchSchema.parse(await res.json());
        return data.flatMap(({ node }) => {
          const parsed = NodeSchema.safeParse(node);
          return parsed.success ? [toCandidate(parsed.data)] : [];
        });
      }),
    stats: (id) =>
      serial(async () => {
        const res = await call(`/anime/${id}`, { fields: STATS_FIELDS });
        if (res.status === 404) return null;
        if (!res.ok) {
          throw new MalError(
            `MAL /anime/${id} answered ${res.status}`,
            res.status,
          );
        }
        return toStats(NodeSchema.parse(await res.json()));
      }),
    entry: (id) =>
      serial(async () => {
        const res = await call(`/anime/${id}`, {
          fields: `${FIELDS},related_anime`,
          nsfw: 'true',
        });
        if (res.status === 404) return null;
        if (!res.ok) {
          throw new MalError(
            `MAL /anime/${id} answered ${res.status}`,
            res.status,
          );
        }
        const node = EntrySchema.parse(await res.json());
        return {
          candidate: toCandidate(node),
          related: (node.related_anime ?? []).map((r) => ({
            id: r.node.id,
            relationType: r.relation_type,
          })),
        };
      }),
  };
}
