import { Logger } from '@nestjs/common';
import type { TitleInput } from '../art/contract.ts';
import { describeError } from '../art/art.filler.ts';
import { searchQueries } from '../art/tmdb/titles.ts';
import type { Clock } from '../common/clock.ts';
import { MIN_QUERY_LENGTH, type MalClient } from './mal.client.ts';
import { matchMal } from './mal.matcher.ts';
import {
  MAL_MATCHER_VERSION,
  isMalSettled,
  type MalStatus,
} from './mal.retry.ts';
import type { MalStore, StoredMal } from './mal.store.ts';

// Each query is one call to MAL, so a title that matches nothing costs at most this many.
export const MAX_QUERIES = 3;

// Single-flight lives in this process's memory, and the client already serializes calls to MAL.
export class MalFiller {
  private readonly logger = new Logger(MalFiller.name);
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly store: MalStore;
  private readonly client: MalClient;
  private readonly now: Clock;

  constructor(store: MalStore, client: MalClient, now: Clock) {
    this.store = store;
    this.client = client;
    this.now = now;
  }

  has(slug: string): boolean {
    return this.inFlight.has(slug);
  }

  fill(input: TitleInput): Promise<void> {
    const existing = this.inFlight.get(input.slug);
    if (existing) return existing;
    const done = this.run(input)
      .catch((error: unknown) => {
        this.logger.error(
          `mal ${input.slug} could not be saved: ${describeError(error)}`,
        );
      })
      .finally(() => this.inFlight.delete(input.slug));
    this.inFlight.set(input.slug, done);
    return done;
  }

  async idle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight.values()]);
    }
  }

  private async run(input: TitleInput): Promise<void> {
    const current = (await this.store.find([input.slug])).get(input.slug);
    if (isMalSettled(current, this.now())) return;
    try {
      if (current?.status === 'ok' && current.malId !== null) {
        await this.refresh(current);
      } else {
        await this.match(input);
      }
    } catch (error) {
      const reason = describeError(error);
      this.logger.warn(`mal ${input.slug} failed: ${reason}`);
      if (current?.status === 'ok') await this.store.touch(input.slug);
      else await this.saveMiss(input.slug, 'failed', reason);
    }
  }

  private async refresh(current: StoredMal): Promise<void> {
    if (current.malId === null) return;
    const stats = await this.client.stats(current.malId);
    if (!stats) {
      await this.store.touch(current.slug);
      return;
    }
    const now = this.now();
    await this.store.save({
      ...current,
      score: stats.score,
      voters: stats.voters,
      rank: stats.rank,
      popularity: stats.popularity,
      members: stats.members,
      airing: stats.airing,
      episodes: stats.episodes,
      attemptedAt: now,
      fetchedAt: now,
    });
  }

  private async match(input: TitleInput): Promise<void> {
    const queries = searchQueries(input.name, input.slug)
      .filter((q) => q.length >= MIN_QUERY_LENGTH)
      .slice(0, MAX_QUERIES);
    for (const query of queries) {
      const found = matchMal(input, await this.client.search(query));
      if (!found) continue;
      const { candidate, score } = found;
      const now = this.now();
      await this.store.save({
        slug: input.slug,
        status: 'ok',
        malId: candidate.id,
        score: candidate.score,
        voters: candidate.voters,
        rank: candidate.rank,
        popularity: candidate.popularity,
        members: candidate.members,
        airing: candidate.airing,
        episodes: candidate.episodes ?? null,
        matchedTitle: candidate.title,
        matchScore: Math.round(score * 1000) / 1000,
        matcherVersion: MAL_MATCHER_VERSION,
        reason: null,
        attemptedAt: now,
        fetchedAt: now,
      });
      return;
    }
    await this.saveMiss(input.slug, 'none', 'no candidate cleared the match');
  }

  private async saveMiss(
    slug: string,
    status: Exclude<MalStatus, 'ok'>,
    reason: string,
  ): Promise<void> {
    await this.store.save({
      slug,
      status,
      malId: null,
      score: null,
      voters: null,
      rank: null,
      popularity: null,
      members: null,
      airing: null,
      episodes: null,
      matchedTitle: null,
      matchScore: null,
      matcherVersion: MAL_MATCHER_VERSION,
      reason,
      attemptedAt: this.now(),
      fetchedAt: null,
    });
  }
}
