import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { CLOCK, systemClock } from '../common/clock.ts';
import { WatchProgressController } from './watch-progress.controller.ts';
import {
  PostgresWatchProgressStore,
  WATCH_PROGRESS_STORE,
} from './watch-progress.store.ts';

@Module({
  imports: [AuthModule],
  controllers: [WatchProgressController],
  providers: [
    { provide: WATCH_PROGRESS_STORE, useClass: PostgresWatchProgressStore },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class WatchProgressModule {}
