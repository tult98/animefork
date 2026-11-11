import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ArtModule } from './art/art.module.ts';
import { HttpErrorFilter } from './common/http-error.filter.ts';
import { APP_CONFIG, type AppConfig } from './config/app.config.ts';
import { ConfigModule } from './config/config.module.ts';
import { DatabaseModule } from './database/database.module.ts';
import { HealthModule } from './health/health.module.ts';

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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
