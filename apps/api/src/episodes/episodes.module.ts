import { Module } from '@nestjs/common';
import type pg from 'pg';
import { loadDeepSeekConfig } from '../art/art.config.ts';
import { CLOCK, systemClock, type Clock } from '../common/clock.ts';
import { PG_POOL } from '../database/migration-runner.ts';
import { ENV, type Env } from '../config/app.config.ts';
import {
  createEpisodeSiteClient,
  DEFAULT_GAP_MS,
  type EpisodeSiteClient,
} from './episode.client.ts';
import { EpisodeFiller } from './episode.filler.ts';
import { createRateLimiter, type RateLimiter } from './episode.limiter.ts';
import {
  EPISODE_STORE,
  PostgresEpisodeStore,
  type EpisodeStore,
} from './episode.store.ts';
import { createEpisodeTranslators } from './episode.translate.ts';

export const EPISODE_LIMITER = Symbol('EpisodeLimiter');
export const EPISODE_SITE = Symbol('EpisodeSite');
export const EPISODE_FILLER = Symbol('EpisodeFiller');

@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    {
      provide: EPISODE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool) => new PostgresEpisodeStore(pool),
    },
    {
      provide: EPISODE_LIMITER,
      useFactory: (): RateLimiter =>
        createRateLimiter({ gapMs: DEFAULT_GAP_MS }),
    },
    {
      provide: EPISODE_SITE,
      inject: [EPISODE_LIMITER],
      useFactory: (limiter: RateLimiter): EpisodeSiteClient =>
        createEpisodeSiteClient({ limiter }),
    },
    {
      provide: EPISODE_FILLER,
      inject: [EPISODE_STORE, EPISODE_SITE, ENV, CLOCK],
      useFactory: (
        store: EpisodeStore,
        site: EpisodeSiteClient,
        env: Env,
        now: Clock,
      ): EpisodeFiller => {
        const deepseek = loadDeepSeekConfig(env);
        return new EpisodeFiller(
          store,
          site,
          deepseek ? createEpisodeTranslators(deepseek) : null,
          now,
        );
      },
    },
  ],
  exports: [EPISODE_FILLER],
})
export class EpisodesModule {}
