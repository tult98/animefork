import { Module } from '@nestjs/common';
import { loadDeepSeekConfig } from '../art/art.config.ts';
import { CLOCK, systemClock, type Clock } from '../common/clock.ts';
import { ENV, type Env } from '../config/app.config.ts';
import { createJikanClient, type EpisodeListClient } from './jikan.client.ts';
import { createJikanLimiter, type JikanLimiter } from './jikan.limiter.ts';
import { EpisodeFiller } from './episode.filler.ts';
import {
  EPISODE_STORE,
  PostgresEpisodeStore,
  type EpisodeStore,
} from './episode.store.ts';
import { createEpisodeTranslators } from './episode.translate.ts';

export const JIKAN_LIMITER = Symbol('JikanLimiter');
export const EPISODE_LIST = Symbol('EpisodeList');
export const EPISODE_FILLER = Symbol('EpisodeFiller');

@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: EPISODE_STORE, useClass: PostgresEpisodeStore },
    { provide: JIKAN_LIMITER, useFactory: () => createJikanLimiter() },
    {
      provide: EPISODE_LIST,
      inject: [JIKAN_LIMITER],
      useFactory: (limiter: JikanLimiter): EpisodeListClient =>
        createJikanClient({ limiter }),
    },
    {
      provide: EPISODE_FILLER,
      inject: [EPISODE_STORE, EPISODE_LIST, ENV, CLOCK],
      useFactory: (
        store: EpisodeStore,
        site: EpisodeListClient,
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
