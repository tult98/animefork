import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.ts';
import { ENV } from '../config/app.config.ts';
import { ART_CONFIG, loadArtConfig, type ArtConfig } from './art.config.ts';
import { ArtController } from './art.controller.ts';
import {
  ART_SYNC,
  ArtFiller,
  DEFAULT_FILL_CONCURRENCY,
  FILL_CONCURRENCY,
} from './art.filler.ts';
import { ArtService } from './art.service.ts';
import { ART_STORE, PostgresArtStore } from './art.store.ts';
import { BaselineMatcher } from './tmdb/matcher.ts';
import type { SyncDeps } from './tmdb/sync.ts';
import { createTmdbClient } from './tmdb/tmdb.ts';

@Module({
  controllers: [ArtController],
  providers: [
    { provide: ART_CONFIG, inject: [ENV], useFactory: loadArtConfig },
    {
      provide: ART_SYNC,
      inject: [ART_CONFIG],
      useFactory: (config: ArtConfig): SyncDeps => ({
        tmdb: createTmdbClient({
          apiKey: config.tmdbApiKey,
          baseUrl: config.tmdbApiBase,
        }),
        matcher: new BaselineMatcher(),
      }),
    },
    { provide: ART_STORE, useClass: PostgresArtStore },
    { provide: FILL_CONCURRENCY, useValue: DEFAULT_FILL_CONCURRENCY },
    { provide: CLOCK, useValue: systemClock },
    ArtFiller,
    ArtService,
  ],
})
export class ArtModule {}
