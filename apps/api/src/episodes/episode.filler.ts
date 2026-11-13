import { Logger } from '@nestjs/common';
import { describeError } from '../art/art.filler.ts';
import { TITLE_BATCH_SIZE, translateInBatches } from '../art/translator.ts';
import type { MalAiring } from '../art/contract.ts';
import type { Clock } from '../common/clock.ts';
import type { EpisodeLister } from './episode.client.ts';
import { isEpisodeListSettled } from './episode.retry.ts';
import type { EpisodeStore } from './episode.store.ts';
import type { EpisodeTranslators } from './episode.translate.ts';

export interface EpisodeTarget {
  slug: string;
  malId: number;
  airing: MalAiring | null;
}

// Most list reads waiting behind the one running. Past it a target is dropped, and its next lookup schedules it again.
export const MAX_QUEUED_LISTS = 20;

// Shows whose titles are being translated at once. Translation never holds the MAL slot.
const TRANSLATE_CONCURRENCY = 2;

// Fills episode names in the background for the MAL lookup. One MAL list request per show (more only past 100
// episodes), and nothing here ever throws into the caller.
// One list read runs at a time. Its slot is held to read and store the list, not to translate it. Single-flight lives
// in this process's memory, like the other fillers.
export class EpisodeFiller {
  private readonly logger = new Logger(EpisodeFiller.name);
  private readonly inFlight = new Map<number, Promise<void>>();
  private readonly translations = new Map<number, Promise<void>>();
  private translating = 0;
  private readonly translateQueue: (() => void)[] = [];
  private readonly store: EpisodeStore;
  private readonly site: EpisodeLister;
  private readonly queue: (() => void)[] = [];
  private running = false;
  // Null stores the English name and leaves the Vietnamese one empty.
  private readonly translators: EpisodeTranslators | null;
  private readonly now: Clock;

  constructor(
    store: EpisodeStore,
    site: EpisodeLister,
    translators: EpisodeTranslators | null,
    now: Clock,
  ) {
    this.store = store;
    this.site = site;
    this.translators = translators;
    this.now = now;
  }

  // Starts a fill for each target whose list is not settled. One query covers all of them.
  async ensure(targets: EpisodeTarget[]): Promise<void> {
    const wanted = targets.filter((t) => !this.inFlight.has(t.malId));
    if (wanted.length === 0) return;
    try {
      const attempts = await this.store.listAttempts(
        wanted.map((t) => t.malId),
      );
      const now = this.now();
      for (const target of wanted) {
        if (
          !isEpisodeListSettled(attempts.get(target.malId), target.airing, now)
        ) {
          void this.start(target);
        }
      }
    } catch (error) {
      this.logger.warn(
        `episodes could not be scheduled: ${describeError(error)}`,
      );
    }
  }

  // Resolves when the list is stored, settled already, or failed. Never rejects.
  async fill(target: EpisodeTarget): Promise<void> {
    const existing = this.inFlight.get(target.malId);
    if (existing) return existing;
    try {
      const attempts = await this.store.listAttempts([target.malId]);
      if (
        isEpisodeListSettled(
          attempts.get(target.malId),
          target.airing,
          this.now(),
        )
      ) {
        return;
      }
    } catch (error) {
      this.logger.warn(
        `episodes ${target.slug} failed: ${describeError(error)}`,
      );
      return;
    }
    return this.start(target);
  }

  has(malId: number): boolean {
    return this.inFlight.has(malId);
  }

  async idle(): Promise<void> {
    while (this.inFlight.size > 0 || this.translations.size > 0) {
      await Promise.all([
        ...this.inFlight.values(),
        ...this.translations.values(),
      ]);
    }
  }

  private start(target: EpisodeTarget): Promise<void> {
    const existing = this.inFlight.get(target.malId);
    if (existing) return existing;
    if (this.running && this.queue.length >= MAX_QUEUED_LISTS) {
      return Promise.resolve();
    }
    const done = this.slot()
      .then(async () => {
        try {
          return await this.run(target);
        } finally {
          this.release();
        }
      })
      .then((stored) => {
        this.inFlight.delete(target.malId);
        if (stored) this.startTranslation(target);
      });
    this.inFlight.set(target.malId, done);
    return done;
  }

  private slot(): Promise<void> {
    if (!this.running) {
      this.running = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.running = false;
  }

  // True when the list is stored. A translator outage never fails the attempt, only a list failure does.
  private async run({ slug, malId, airing }: EpisodeTarget): Promise<boolean> {
    let failure: string | null = null;
    let stored = false;
    try {
      const listed = await this.site.list(malId);
      if (listed) {
        await this.store.saveListed(malId, listed);
        stored = true;
      } else {
        failure = 'MAL has no episode list for this entry';
      }
    } catch (error) {
      failure = describeError(error);
    }
    if (failure !== null) {
      this.logger.warn(`episodes ${slug} failed: ${failure}`);
    }
    try {
      await this.store.saveListAttempt({
        malId,
        status: failure === null ? 'ok' : 'failed',
        airing,
        attemptedAt: this.now(),
      });
    } catch (error) {
      this.logger.warn(`episodes ${slug} failed: ${describeError(error)}`);
    }
    return stored;
  }

  private startTranslation({ slug, malId }: EpisodeTarget): void {
    if (!this.translators || this.translations.has(malId)) return;
    const done = this.withTranslateSlot(() =>
      this.translate(slug, malId),
    ).finally(() => this.translations.delete(malId));
    this.translations.set(malId, done);
  }

  private async withTranslateSlot(job: () => Promise<void>): Promise<void> {
    if (this.translating < TRANSLATE_CONCURRENCY) {
      this.translating++;
    } else {
      await new Promise<void>((resolve) => {
        this.translateQueue.push(() => {
          this.translating++;
          resolve();
        });
      });
    }
    try {
      await job();
    } finally {
      this.translating--;
      this.translateQueue.shift()?.();
    }
  }

  // Translates the titles still empty, a batch per request, saving each batch before the next. It stops at the first
  // failure so a translator that is down is asked once. A later fill of the show reads the rest.
  private async translate(slug: string, malId: number): Promise<void> {
    if (!this.translators) return;
    try {
      const pending = [...(await this.store.find(malId)).values()].filter(
        (row) => row.titleVi === null,
      );
      await translateInBatches(
        this.translators.title,
        pending.map((row) => row.title),
        TITLE_BATCH_SIZE,
        async (start, translated) => {
          for (const [i, titleVi] of translated.entries()) {
            const row = pending[start + i];
            if (row)
              await this.store.saveTranslation(malId, row.number, titleVi);
          }
        },
      );
    } catch (error) {
      this.logger.warn(
        `episode titles ${slug} failed: ${describeError(error)}`,
      );
    }
  }
}
