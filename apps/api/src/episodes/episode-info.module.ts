import { Module } from '@nestjs/common';
import { ART_STORE, PostgresArtStore } from '../art/art.store.ts';
import { CLOCK, systemClock } from '../common/clock.ts';
import { MalModule } from '../mal/mal.module.ts';
import { EpisodeInfoController } from './episode-info.controller.ts';
import { EpisodeInfoService } from './episode-info.service.ts';
import { EPISODE_STORE, PostgresEpisodeStore } from './episode.store.ts';

@Module({
  imports: [MalModule],
  controllers: [EpisodeInfoController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: EPISODE_STORE, useClass: PostgresEpisodeStore },
    { provide: ART_STORE, useClass: PostgresArtStore },
    EpisodeInfoService,
  ],
})
export class EpisodeInfoModule {}
