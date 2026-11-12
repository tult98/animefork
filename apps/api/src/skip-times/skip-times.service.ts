import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.ts';
import { MAL_STORE, type MalStore } from '../mal/mal.store.ts';
import type { AniskipClient } from './aniskip.client.ts';
import type { SkipSegment, SkipTimesResponse } from './contract.ts';

export const ANISKIP_CLIENT = Symbol('AniskipClient');

export const ANSWER_TTL_MS = 24 * 60 * 60_000;
export const FAILURE_TTL_MS = 60_000;
export const MAX_CACHED = 5000;

interface Cached {
  segments: SkipSegment[];
  expiresAt: number;
}

@Injectable()
export class SkipTimesService {
  private readonly logger = new Logger(SkipTimesService.name);
  private readonly mal: MalStore;
  private readonly aniskip: AniskipClient;
  private readonly now: Clock;
  private readonly cache = new Map<string, Cached>();

  constructor(
    @Inject(MAL_STORE) mal: MalStore,
    @Inject(ANISKIP_CLIENT) aniskip: AniskipClient,
    @Inject(CLOCK) now: Clock,
  ) {
    this.mal = mal;
    this.aniskip = aniskip;
    this.now = now;
  }

  async lookup(slug: string, episode: number): Promise<SkipTimesResponse> {
    const malId = (await this.mal.find([slug])).get(slug)?.malId ?? null;
    if (malId === null) return { segments: [] };
    return { segments: await this.segments(malId, episode) };
  }

  private async segments(
    malId: number,
    episode: number,
  ): Promise<SkipSegment[]> {
    const key = `${malId}:${episode}`;
    const at = this.now().getTime();
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > at) return hit.segments;
    try {
      const segments = await this.aniskip.skipTimes(malId, episode);
      this.remember(key, segments, at + ANSWER_TTL_MS);
      return segments;
    } catch (error) {
      this.logger.warn(
        `skip times for ${key} unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.remember(key, [], at + FAILURE_TTL_MS);
      return [];
    }
  }

  private remember(key: string, segments: SkipSegment[], expiresAt: number) {
    this.cache.delete(key);
    this.cache.set(key, { segments, expiresAt });
    if (this.cache.size > MAX_CACHED) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}
