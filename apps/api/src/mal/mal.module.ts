import { Module } from '@nestjs/common';
import { loadJevConfig } from '../art/art.config.ts';
import { CLOCK, systemClock, type Clock } from '../common/clock.ts';
import { ENV, type Env } from '../config/app.config.ts';
import type { EpisodeFiller } from '../episodes/episode.filler.ts';
import { EPISODE_FILLER, EpisodesModule } from '../episodes/episodes.module.ts';
import { createMalClient, type MalClient } from './mal.client.ts';
import { MAL_CONFIG, loadMalConfig, type MalConfig } from './mal.config.ts';
import { createTrailerClient, type TrailerClient } from './trailer.client.ts';
import { MalFiller } from './mal.filler.ts';
import { createMalJudge } from './mal.jev.ts';
import { MAL_STORE, PostgresMalStore, type MalStore } from './mal.store.ts';

export const MAL_CLIENT = Symbol('MalClient');
export const MAL_FILLER = Symbol('MalFiller');
export const TRAILER_CLIENT = Symbol('TrailerClient');

@Module({
  imports: [EpisodesModule],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: MAL_CONFIG, inject: [ENV], useFactory: loadMalConfig },
    { provide: MAL_STORE, useClass: PostgresMalStore },
    {
      provide: MAL_CLIENT,
      inject: [MAL_CONFIG],
      useFactory: (config: MalConfig | undefined): MalClient | null =>
        config
          ? createMalClient({
              clientId: config.clientId,
              baseUrl: config.baseUrl,
            })
          : null,
    },
    {
      provide: TRAILER_CLIENT,
      inject: [MAL_CONFIG],
      useFactory: (config: MalConfig | undefined): TrailerClient | null =>
        config ? createTrailerClient({ baseUrl: config.trailerBaseUrl }) : null,
    },
    {
      provide: MAL_FILLER,
      inject: [
        MAL_STORE,
        MAL_CLIENT,
        CLOCK,
        ENV,
        EPISODE_FILLER,
        TRAILER_CLIENT,
      ],
      useFactory: (
        store: MalStore,
        client: MalClient | null,
        now: Clock,
        env: Env,
        episodes: EpisodeFiller,
        trailers: TrailerClient | null,
      ): MalFiller | null =>
        client
          ? new MalFiller(
              store,
              client,
              now,
              createMalJudge(loadJevConfig(env)),
              episodes,
              trailers,
            )
          : null,
    },
  ],
  exports: [MAL_STORE, MAL_FILLER],
})
export class MalModule {}
