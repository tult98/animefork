import type { Clock } from '../common/clock.ts';
import type { MalCandidate, MalClient } from './mal.client.ts';
import { isShow } from './mal.matcher.ts';

export const FRANCHISE_TTL_MS = 7 * 24 * 60 * 60_000;
// Conan alone reaches about 80 entries; the cap only stops a graph that keeps going.
export const MAX_FRANCHISE_NODES = 150;

const CHAIN = new Set(['sequel', 'prequel']);

interface Cached {
  at: number;
  pool: MalCandidate[];
}

// The entries MAL relates to a franchise's anchors: the series' movies, specials and seasons.
export class MalFranchise {
  private readonly cache = new Map<string, Cached>();
  private readonly inFlight = new Map<string, Promise<MalCandidate[]>>();
  private readonly client: Pick<MalClient, 'entry'>;
  private readonly now: Clock;

  constructor(client: Pick<MalClient, 'entry'>, now: Clock) {
    this.client = client;
    this.now = now;
  }

  candidates(anchors: number[]): Promise<MalCandidate[]> {
    const ids = [...new Set(anchors)].sort((a, b) => a - b);
    const key = ids.join(',');
    const cached = this.cache.get(key);
    if (cached && this.now().getTime() - cached.at < FRANCHISE_TTL_MS) {
      return Promise.resolve(cached.pool);
    }
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const run = this.walk(ids)
      .then((pool) => {
        this.cache.set(key, { at: this.now().getTime(), pool });
        return pool;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  // An anchor's every relation joins the pool; from there only sequel and prequel links are
  // followed, because a movie's side stories lead into other franchises.
  private async walk(anchors: number[]): Promise<MalCandidate[]> {
    const anchorIds = new Set(anchors);
    const seen = new Set(anchors);
    const queue = [...anchors];
    const pool: MalCandidate[] = [];
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const entry = await this.client.entry(id);
      if (!entry) continue;
      const anchor = anchorIds.has(id);
      if (!anchor && isShow(entry.candidate)) pool.push(entry.candidate);
      for (const related of entry.related) {
        if (seen.has(related.id) || seen.size >= MAX_FRANCHISE_NODES) continue;
        if (!anchor && !CHAIN.has(related.relationType)) continue;
        seen.add(related.id);
        queue.push(related.id);
      }
    }
    return pool;
  }
}
