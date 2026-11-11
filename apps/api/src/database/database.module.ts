import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/app.config.ts';
import {
  DEFAULT_MIGRATIONS_DIR,
  MIGRATIONS_DIR,
  MigrationRunner,
  PG_POOL,
} from './migration-runner.ts';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new pg.Pool({ connectionString: config.databaseUrl }),
    },
    { provide: MIGRATIONS_DIR, useValue: DEFAULT_MIGRATIONS_DIR },
    MigrationRunner,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
