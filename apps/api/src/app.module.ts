import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ArtModule } from './art/art.module.ts';
import { AuthModule } from './auth/auth.module.ts';
import { EpisodeInfoModule } from './episodes/episode-info.module.ts';
import { HttpErrorFilter } from './common/http-error.filter.ts';
import { APP_CONFIG, type AppConfig } from './config/app.config.ts';
import { ConfigModule } from './config/config.module.ts';
import { DatabaseModule } from './database/database.module.ts';
import { HealthModule } from './health/health.module.ts';
import { SkipTimesModule } from './skip-times/skip-times.module.ts';
import { WatchProgressModule } from './watch-progress/watch-progress.module.ts';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: 60_000, limit: config.rateLimitPerMinute }],
      }),
    }),
    HealthModule,
    ArtModule,
    AuthModule,
    EpisodeInfoModule,
    SkipTimesModule,
    WatchProgressModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
