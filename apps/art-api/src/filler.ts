import type { TitleInput } from './contract.ts';
import { isSettled } from './retry.ts';
import type { ArtStore } from './store.ts';
import { syncTitle, type SyncDeps } from './sync.ts';

export const DEFAULT_FILL_CONCURRENCY = 2;

export interface FillerOptions {
  store: ArtStore;
  sync: SyncDeps;
  concurrency?: number;
  now?: () => Date;
  log?: (message: string) => void;
}

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
  return `${error.message}${cause}`;
}

// Single-flight lives in this process's memory, so it only dedupes TMDB calls when one replica serves the API.
export class ArtFiller {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly queue: (() => void)[] = [];
  private running = 0;
  private readonly store: ArtStore;
  private readonly sync: SyncDeps;
  private readonly concurrency: number;
  private readonly now: () => Date;
  private readonly log: (message: string) => void;

  constructor(options: FillerOptions) {
    this.store = options.store;
    this.sync = options.sync;
    this.concurrency = options.concurrency ?? DEFAULT_FILL_CONCURRENCY;
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? (() => undefined);
  }

  has(slug: string): boolean {
    return this.inFlight.has(slug);
  }

  fill(input: TitleInput): Promise<void> {
    const existing = this.inFlight.get(input.slug);
    if (existing) return existing;
    const done = this.slot()
      .then(() => this.run(input))
      .catch((error: unknown) => {
        this.log(
          `fill ${input.slug} could not be saved: ${describeError(error)}`,
        );
      })
      .finally(() => {
        this.release();
        this.inFlight.delete(input.slug);
      });
    this.inFlight.set(input.slug, done);
    return done;
  }

  async idle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all(this.inFlight.values());
    }
  }

  private slot(): Promise<void> {
    if (this.running < this.concurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  private release(): void {
    this.running--;
    this.queue.shift()?.();
  }

  private async run(input: TitleInput): Promise<void> {
    const { store } = this;
    const current = (await store.find([input.slug])).get(input.slug);
    if (current && isSettled(current, this.now())) return;

    let outcome;
    try {
      outcome = await syncTitle(input, this.sync);
    } catch (error) {
      const reason = describeError(error);
      this.log(`fill ${input.slug} failed: ${reason}`);
      await store.saveMiss(input.slug, 'failed', reason);
      return;
    }
    if (outcome.kind === 'matched') {
      await store.saveMatched(outcome.matched);
    } else {
      await store.saveMiss(input.slug, 'no_match', outcome.skipped.reason);
    }
  }
}
