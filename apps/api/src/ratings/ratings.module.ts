import { Module } from '@nestjs/common';
import { RatingsController } from './ratings.controller.ts';
import { PostgresRatingsStore, RATINGS_STORE } from './ratings.store.ts';

@Module({
  controllers: [RatingsController],
  providers: [{ provide: RATINGS_STORE, useClass: PostgresRatingsStore }],
  exports: [RATINGS_STORE],
})
export class RatingsModule {}
