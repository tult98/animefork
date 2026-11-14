import type { Clock } from '../common/clock.ts';
import type { MalCandidate, MalClient, MalEntry } from './mal.client.ts';
import { isShow } from './mal.matcher.ts';

export const FRANCHISE_TTL_MS = 7 * 24 * 60 * 60_000;
// Conan alone reaches about 80 entries; the cap only stops a graph that keeps going.
export const MAX_FRANCHISE_NODES = 150;
const MAX_CACHED_ENTRIES = 5000;

const CHAIN = new Set(['sequel', 'prequel']);

interface Cached {
  at: number;
  entry: MalEntry | null;
}

// The entries MAL relates to a franchise's anchors: the series' movies, specials and seasons.
export class MalFranchise {
  // Keyed by MAL id, not by anchor set: each franchise match adds an anchor, so a pool cached
  // per anchor set would miss on the next movie and read every entry again.
  private readonly entries = new Map<number, Cached>();
  private readonly inFlight = new Map<number, Promise<MalEntry | null>>();
  private readonly client: Pick<MalClient, 'entry'>;
  private readonly now: Clock;

  constructor(client: Pick<MalClient, 'entry'>, now: Clock) {
    this.client = client;
    this.now = now;
  }

  // An anchor's every relation joins the pool; from there only sequel and prequel links are
  // followed, because a movie's side stories lead into other franchises.
  async candidates(anchors: number[]): Promise<MalCandidate[]> {
    const anchorIds = new Set(anchors);
    const seen = new Set(anchorIds);
    const queue = [...anchorIds];
    const pool: MalCandidate[] = [];
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const entry = await this.entry(id);
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

  private entry(id: number): Promise<MalEntry | null> {
    const cached = this.entries.get(id);
    if (cached && this.now().getTime() - cached.at < FRANCHISE_TTL_MS) {
      return Promise.resolve(cached.entry);
    }
    const existing = this.inFlight.get(id);
    if (existing) return existing;
    const run = this.client
      .entry(id)
      .then((entry) => {
        this.remember(id, entry);
        return entry;
      })
      .finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, run);
    return run;
  }

  // A 404 is kept too: a removed entry stays removed, and every walk that reaches it would
  // otherwise spend a MAL call on it. Map order is read order, so the first key is the oldest.
  private remember(id: number, entry: MalEntry | null): void {
    this.entries.delete(id);
    if (this.entries.size >= MAX_CACHED_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(id, { at: this.now().getTime(), entry });
  }
}
