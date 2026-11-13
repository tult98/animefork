import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.ts';
import type { TitleInput } from './contract.ts';
import {
  isEpisodeInfoSettled,
  isOverviewSettled,
  isSettled,
  isStale,
  type EpisodeInfoStatus,
} from './retry.ts';
import {
  ART_STORE,
  type ArtStore,
  type OverviewResult,
  type StoredTitle,
} from './art.store.ts';
import { fetchOverview } from './tmdb/overview.ts';
import { mapEpisodeInfo, syncTitle, type SyncDeps } from './tmdb/sync.ts';
import { OVERVIEW_TRANSLATOR, type OverviewTranslator } from './translator.ts';

export const ART_SYNC = Symbol('ArtSync');
export const FILL_CONCURRENCY = Symbol('FillConcurrency');
export const DEFAULT_FILL_CONCURRENCY = 2;
// A job translates at most this many overviews. The next job of the slug reads the rest.
export const EPISODE_TRANSLATE_CAP = 300;
const TRANSLATE_CONCURRENCY = 4;

interface EpisodeInfoTarget {
  slug: string;
  tmdbId: number;
  season: number;
  episodeCount: number | undefined;
}

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
  private readonly episodeInfoInFlight = new Map<string, Promise<void>>();
  private readonly queue: (() => void)[] = [];
  private running = 0;
  private translating = 0;
  private readonly translateQueue: (() => void)[] = [];
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

  fill(input: TitleInput, namesAt?: Date): Promise<void> {
    return this.schedule(this.inFlight, input.slug, 'fill', () =>
      this.run(input, namesAt),
    );
  }

  // Overview jobs have their own single-flight map, so one never makes an art fill wait or be skipped.
  fillOverview(slug: string, tmdbId: number): Promise<void> {
    return this.schedule(this.overviewsInFlight, slug, 'overview', () =>
      this.runOverview(slug, tmdbId),
    );
  }

  // Schedules the episode text job for each matched season-scope row that has none settled. Never waits for a job.
  async ensureEpisodeInfo(rows: StoredTitle[]): Promise<void> {
    const targets = rows.flatMap((row) =>
      row.status === 'matched' &&
      row.matchScope === 'season' &&
      row.tmdbId !== null &&
      row.tmdbSeason !== null &&
      !this.inFlight.has(row.slug) &&
      !this.episodeInfoInFlight.has(row.slug)
        ? [
            {
              slug: row.slug,
              tmdbId: row.tmdbId,
              season: row.tmdbSeason,
              episodeCount: row.sourceEpisodeCount ?? undefined,
            },
          ]
        : [],
    );
    if (targets.length === 0) return;
    try {
      const now = this.now();
      const synced = await this.store.episodeInfoSync(
        targets.map((t) => t.slug),
      );
      for (const target of targets) {
        if (!isEpisodeInfoSettled(synced.get(target.slug), now)) {
          void this.fillEpisodeInfo(target);
        }
      }
    } catch (error) {
      this.logger.warn(`episode info lookup failed: ${describeError(error)}`);
    }
  }

  // The season call holds a fill slot. Translation runs after the slot is released, so a long show never holds up a fill.
  private fillEpisodeInfo(target: EpisodeInfoTarget): Promise<void> {
    const { slug } = target;
    const existing = this.episodeInfoInFlight.get(slug);
    if (existing) return existing;
    const done = this.runEpisodeInfo(target)
      .catch((error: unknown) => {
        this.logger.error(
          `episode info ${slug} could not be saved: ${describeError(error)}`,
        );
      })
      .finally(() => this.episodeInfoInFlight.delete(slug));
    this.episodeInfoInFlight.set(slug, done);
    return done;
  }

  async idle(): Promise<void> {
    while (
      this.inFlight.size > 0 ||
      this.overviewsInFlight.size > 0 ||
      this.episodeInfoInFlight.size > 0
    ) {
      await Promise.all([
        ...this.inFlight.values(),
        ...this.overviewsInFlight.values(),
        ...this.episodeInfoInFlight.values(),
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

  private async withSlot<T>(job: () => Promise<T>): Promise<T> {
    await this.slot();
    try {
      return await job();
    } finally {
      this.release();
    }
  }

  private async withTranslateSlot<T>(job: () => Promise<T>): Promise<T> {
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
      return await job();
    } finally {
      this.translating--;
      this.translateQueue.shift()?.();
    }
  }

  private async run(input: TitleInput, namesAt?: Date): Promise<void> {
    const { store } = this;
    const current = (await store.find([input.slug])).get(input.slug);
    if (
      current &&
      isSettled(current, this.now(), namesAt) &&
      !isStale(current)
    ) {
      return;
    }

    let outcome;
    try {
      outcome = await syncTitle(input, this.sync);
    } catch (error) {
      const reason = describeError(error);
      this.logger.warn(`fill ${input.slug} failed: ${reason}`);
      await store.saveMiss(input, 'failed', reason);
      return;
    }
    if (outcome.kind !== 'matched') {
      await store.saveMiss(input, 'no_match', outcome.skipped.reason);
      return;
    }
    const { tmdbId } = outcome.matched;
    await store.saveMatched(outcome.matched);
    await this.translateEpisodeOverviews(input.slug);
    const keepsOverview =
      current?.tmdbId === tmdbId && current.overviewStatus === 'ok';
    if (keepsOverview || this.overviewsInFlight.has(input.slug)) return;
    await store.saveOverview(
      input.slug,
      tmdbId,
      await this.resolveOverview(input.slug, tmdbId),
    );
  }

  // A failure here never fails the fill. It stops at the first one so a translator that is down is asked once.
  // Untranslated rows are picked up again by the next fill of the slug.
  private async translateEpisodeOverviews(slug: string): Promise<void> {
    if (!this.translator) return;
    try {
      for (const row of (await this.store.tmdbEpisodes(slug)).values()) {
        if (row.overview === null || row.overviewVi !== null) continue;
        await this.store.saveEpisodeTranslation(
          slug,
          row.number,
          await this.translator.translate(row.overview),
        );
      }
    } catch (error) {
      this.logger.warn(
        `episode overviews ${slug} failed: ${describeError(error)}`,
      );
    }
  }

  private async runOverview(slug: string, tmdbId: number): Promise<void> {
    const current = (await this.store.find([slug])).get(slug);
    if (
      current?.status !== 'matched' ||
      current.tmdbId !== tmdbId ||
      isOverviewSettled(current, this.now())
    ) {
      return;
    }
    await this.store.saveOverview(
      slug,
      tmdbId,
      await this.resolveOverview(slug, tmdbId),
    );
  }

  private async resolveOverview(
    slug: string,
    tmdbId: number,
  ): Promise<OverviewResult> {
    try {
      const found = await fetchOverview(this.sync.tmdb, tmdbId);
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

  private async runEpisodeInfo(target: EpisodeInfoTarget): Promise<void> {
    const { slug } = target;
    const fetched = await this.withSlot(() => this.fetchEpisodeInfo(target));
    if (fetched !== 'rows') {
      if (fetched !== 'gone')
        await this.store.saveEpisodeInfoSync(slug, fetched);
      return;
    }
    const status = await this.withTranslateSlot(() =>
      this.translateEpisodeInfo(slug),
    );
    await this.store.saveEpisodeInfoSync(slug, status);
  }

  // Rows already stored, by an art fill or an earlier job, are never fetched again.
  private async fetchEpisodeInfo({
    slug,
    tmdbId,
    season,
    episodeCount,
  }: EpisodeInfoTarget): Promise<'rows' | 'gone' | 'none' | 'failed'> {
    const { store } = this;
    const current = (await store.find([slug])).get(slug);
    if (
      current?.status !== 'matched' ||
      current.matchScope !== 'season' ||
      current.tmdbId !== tmdbId ||
      current.tmdbSeason !== season
    ) {
      return 'gone';
    }
    if ((await store.tmdbEpisodes(slug)).size > 0) return 'rows';
    try {
      const detail = await this.sync.tmdb.seasonDetail(tmdbId, season, 'vi');
      const info = mapEpisodeInfo(slug, detail.episodes, 0, episodeCount);
      if (info.length === 0) return 'none';
      await store.saveEpisodeInfo(slug, info);
      return 'rows';
    } catch (error) {
      this.logger.warn(`episode info ${slug} failed: ${describeError(error)}`);
      return 'failed';
    }
  }

  // `failed` means some English overview is still untranslated, so the next job reads the rest without a TMDB call.
  private async translateEpisodeInfo(slug: string): Promise<EpisodeInfoStatus> {
    if (!this.translator) return 'ok';
    try {
      const pending = [
        ...(await this.store.tmdbEpisodes(slug)).values(),
      ].filter((row) => row.overview !== null && row.overviewVi === null);
      for (const row of pending.slice(0, EPISODE_TRANSLATE_CAP)) {
        await this.store.saveEpisodeTranslation(
          slug,
          row.number,
          await this.translator.translate(row.overview ?? ''),
        );
      }
      return pending.length > EPISODE_TRANSLATE_CAP ? 'failed' : 'ok';
    } catch (error) {
      this.logger.warn(
        `episode overviews ${slug} failed: ${describeError(error)}`,
      );
      return 'failed';
    }
  }
}
