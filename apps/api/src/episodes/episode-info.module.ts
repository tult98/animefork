import { Module } from '@nestjs/common';
import type pg from 'pg';
import { ART_STORE, PostgresArtStore } from '../art/art.store.ts';
import { CLOCK, systemClock } from '../common/clock.ts';
import { ArtModule } from '../art/art.module.ts';
import { MalModule } from '../mal/mal.module.ts';
import { PG_POOL } from '../database/migration-runner.ts';
import { EpisodeInfoController } from './episode-info.controller.ts';
import { EpisodeInfoService } from './episode-info.service.ts';
import { EPISODE_STORE, PostgresEpisodeStore } from './episode.store.ts';

@Module({
  imports: [MalModule, ArtModule],
  controllers: [EpisodeInfoController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    {
      provide: EPISODE_STORE,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool) => new PostgresEpisodeStore(pool),
    },
    { provide: ART_STORE, useClass: PostgresArtStore },
    EpisodeInfoService,
  ],
})
export class EpisodeInfoModule {}
