import { Logger } from '@nestjs/common';
import { describeError } from '../art/art.filler.ts';
import type { MalAiring } from '../art/contract.ts';
import type { Clock } from '../common/clock.ts';
import type { EpisodeSiteClient } from './episode.client.ts';
import { isEpisodeListSettled } from './episode.retry.ts';
import type { EpisodeStore } from './episode.store.ts';
import type { EpisodeTranslators } from './episode.translate.ts';

export interface EpisodeTarget {
  slug: string;
  malId: number;
  airing: MalAiring | null;
}

// Fills episode names in the background for the MAL lookup. One list request per show (more only past 100
// episodes), no synopsis pages, and nothing here ever throws into the caller.
// Single-flight lives in this process's memory, like the other fillers.
export class EpisodeFiller {
  private readonly logger = new Logger(EpisodeFiller.name);
  private readonly inFlight = new Map<number, Promise<void>>();
  private readonly store: EpisodeStore;
  private readonly site: EpisodeSiteClient;
  // Null stores the English name and leaves the Vietnamese one empty.
  private readonly translators: EpisodeTranslators | null;
  private readonly now: Clock;

  constructor(
    store: EpisodeStore,
    site: EpisodeSiteClient,
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
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight.values()]);
    }
  }

  private start(target: EpisodeTarget): Promise<void> {
    const existing = this.inFlight.get(target.malId);
    if (existing) return existing;
    const done = this.run(target).finally(() =>
      this.inFlight.delete(target.malId),
    );
    this.inFlight.set(target.malId, done);
    return done;
  }

  private async run({ slug, malId, airing }: EpisodeTarget): Promise<void> {
    let failure: string | null = null;
    try {
      const listed = await this.site.list(malId);
      if (listed) {
        await this.store.saveListed(malId, listed);
        failure = await this.translate(malId);
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
  }

  // Stops at the first failure so a translator that is down is asked once, not once per episode.
  private async translate(malId: number): Promise<string | null> {
    if (!this.translators) return null;
    try {
      for (const row of (await this.store.find(malId)).values()) {
        if (row.titleVi !== null) continue;
        const titleVi = await this.translators.title.translate(row.title);
        await this.store.saveTranslation(malId, row.number, { titleVi });
      }
      return null;
    } catch (error) {
      return describeError(error);
    }
  }
}
