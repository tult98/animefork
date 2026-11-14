import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.ts';
import { normalizeOtherNames, type TitleInput } from './contract.ts';
import {
  isFromOtherMal,
  isOverviewSettled,
  isSettled,
  isStale,
} from './retry.ts';
import { ART_STORE, type ArtStore, type OverviewResult } from './art.store.ts';
import { findFromMal, isSeries, type MalFacts } from './tmdb/from-mal.ts';
import { fetchOverview } from './tmdb/overview.ts';
import { syncTitle, type SyncDeps, type SyncOutcome } from './tmdb/sync.ts';
import type { TmdbKind } from './tmdb/tmdb.ts';
import { OVERVIEW_TRANSLATOR, type OverviewTranslator } from './translator.ts';

export const ART_SYNC = Symbol('ArtSync');
export const FILL_CONCURRENCY = Symbol('FillConcurrency');
export const DEFAULT_FILL_CONCURRENCY = 2;

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
  return `${error.message}${cause}`;
}

// Single-flight lives in this process's memory, so it only dedupes TMDB calls when one replica serves the API.
@Injectable()
export class ArtFiller {
  private readonly logger = new Logger(ArtFiller.name);
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly overviewsInFlight = new Map<string, Promise<void>>();
  private readonly queue: (() => void)[] = [];
  private running = 0;
  private readonly store: ArtStore;
  private readonly sync: SyncDeps;
  private readonly concurrency: number;
  private readonly now: Clock;
  private readonly translator: OverviewTranslator | null;

  constructor(
    @Inject(ART_STORE) store: ArtStore,
    @Inject(ART_SYNC) sync: SyncDeps,
    @Inject(FILL_CONCURRENCY) concurrency: number,
    @Inject(CLOCK) now: Clock,
    @Inject(OVERVIEW_TRANSLATOR) translator: OverviewTranslator | null,
  ) {
    this.store = store;
    this.sync = sync;
    this.concurrency = concurrency;
    this.now = now;
    this.translator = translator;
  }

  has(slug: string): boolean {
    return this.inFlight.has(slug);
  }

  hasOverview(slug: string): boolean {
    return this.overviewsInFlight.has(slug);
  }

  fill(
    input: TitleInput,
    namesAt?: Date,
    facts: MalFacts | null = null,
  ): Promise<void> {
    return this.schedule(this.inFlight, input.slug, 'fill', () =>
      this.run(input, namesAt, facts),
    );
  }

  // Overview jobs have their own single-flight map, so one never makes an art fill wait or be skipped.
  fillOverview(
    slug: string,
    tmdbKind: TmdbKind,
    tmdbId: number,
  ): Promise<void> {
    return this.schedule(this.overviewsInFlight, slug, 'overview', () =>
      this.runOverview(slug, tmdbKind, tmdbId),
    );
  }

  async idle(): Promise<void> {
    while (this.inFlight.size > 0 || this.overviewsInFlight.size > 0) {
      await Promise.all([
        ...this.inFlight.values(),
        ...this.overviewsInFlight.values(),
      ]);
    }
  }

  private schedule(
    inFlight: Map<string, Promise<void>>,
    slug: string,
    kind: string,
    job: () => Promise<void>,
  ): Promise<void> {
    const existing = inFlight.get(slug);
    if (existing) return existing;
    const done = this.slot()
      .then(job)
      .catch((error: unknown) => {
        this.logger.error(
          `${kind} ${slug} could not be saved: ${describeError(error)}`,
        );
      })
      .finally(() => {
        this.release();
        inFlight.delete(slug);
      });
    inFlight.set(slug, done);
    return done;
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

  private async run(
    input: TitleInput,
    namesAt: Date | undefined,
    facts: MalFacts | null,
  ): Promise<void> {
    const { store } = this;
    const current = (await store.find([input.slug])).get(input.slug);
    const malId = facts?.malId ?? null;
    const fromOtherMal =
      current !== undefined && isFromOtherMal(current, malId);
    if (
      current &&
      isSettled(current, this.now(), namesAt) &&
      !isStale(current) &&
      !fromOtherMal
    ) {
      return;
    }

    let outcome;
    try {
      outcome = await this.find(input, facts);
    } catch (error) {
      const reason = describeError(error);
      this.logger.warn(`fill ${input.slug} failed: ${reason}`);
      await store.saveMiss(input, 'failed', reason);
      return;
    }
    if (outcome.kind !== 'matched') {
      if (fromOtherMal && malId !== null) {
        await store.stampSourceMalId(input.slug, malId);
      } else {
        await store.saveMiss(input, 'no_match', outcome.skipped.reason);
      }
      return;
    }
    const { tmdbKind, tmdbId } = outcome.matched;
    await store.saveMatched(outcome.matched, { overwriteMatch: fromOtherMal });
    const keepsOverview =
      current?.tmdbKind === tmdbKind &&
      current.tmdbId === tmdbId &&
      current.overviewStatus === 'ok';
    if (keepsOverview || this.overviewsInFlight.has(input.slug)) return;
    await store.saveOverview(
      input.slug,
      tmdbKind,
      tmdbId,
      await this.resolveOverview(input.slug, tmdbKind, tmdbId),
    );
  }

  private async find(
    input: TitleInput,
    facts: MalFacts | null,
  ): Promise<SyncOutcome> {
    if (!facts) return syncTitle(input, this.sync);
    const fromMal = await findFromMal(input, facts, this.sync.tmdb);
    if (fromMal.kind === 'matched') return fromMal;
    const otherNames = normalizeOtherNames(
      [facts.english ?? '', facts.title, ...(input.otherNames ?? [])],
      input.name,
    );
    const outcome = await syncTitle({ ...input, otherNames }, this.sync, {
      sideEntry: !isSeries(facts),
    });
    if (outcome.kind !== 'matched') return outcome;
    const { matched } = outcome;
    return {
      kind: 'matched',
      matched: {
        ...matched,
        title: { ...matched.title, source_mal_id: facts.malId },
      },
    };
  }

  private async runOverview(
    slug: string,
    tmdbKind: TmdbKind,
    tmdbId: number,
  ): Promise<void> {
    const current = (await this.store.find([slug])).get(slug);
    if (
      current?.status !== 'matched' ||
      current.tmdbKind !== tmdbKind ||
      current.tmdbId !== tmdbId ||
      isOverviewSettled(current, this.now())
    ) {
      return;
    }
    await this.store.saveOverview(
      slug,
      tmdbKind,
      tmdbId,
      await this.resolveOverview(slug, tmdbKind, tmdbId),
    );
  }

  private async resolveOverview(
    slug: string,
    tmdbKind: TmdbKind,
    tmdbId: number,
  ): Promise<OverviewResult> {
    try {
      const found = await fetchOverview(this.sync.tmdb, tmdbKind, tmdbId);
      if (!found) return { status: 'none' };
      if (found.lang === 'vi') {
        return {
          status: 'ok',
          text: found.text,
          lang: 'vi',
          translated: false,
        };
      }
      if (!this.translator) return { status: 'none' };
      const text = await this.translator.translate(found.text);
      return { status: 'ok', text, lang: 'en', translated: true };
    } catch (error) {
      this.logger.warn(`overview ${slug} failed: ${describeError(error)}`);
      return { status: 'failed' };
    }
  }
}
