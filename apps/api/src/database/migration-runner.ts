import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type pg from 'pg';

export const PG_POOL = Symbol('PgPool');
export const MIGRATIONS_DIR = Symbol('MigrationsDir');

export const DEFAULT_MIGRATIONS_DIR = resolve(
  import.meta.dirname,
  '../../db/migrations',
);

const MIGRATION_FILE = /^\d+_[\w-]+\.sql$/;
// Any constant works; it only has to be the same in every replica that boots.
const MIGRATION_LOCK = 4_120_771;

@Injectable()
export class MigrationRunner implements OnModuleInit {
  private readonly logger = new Logger(MigrationRunner.name);
  private readonly pool: pg.Pool;
  private readonly dir: string;

  constructor(
    @Inject(PG_POOL) pool: pg.Pool,
    @Inject(MIGRATIONS_DIR) dir: string,
  ) {
    this.pool = pool;
    this.dir = dir;
  }

  async onModuleInit(): Promise<void> {
    await this.run();
  }

  async run(): Promise<string[]> {
    const files = (await readdir(this.dir))
      .filter((f) => MIGRATION_FILE.test(f))
      .sort();
    const client = await this.pool.connect();
    const applied: string[] = [];
    try {
      await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
      await client.query(
        `create table if not exists schema_migrations (
           name text primary key,
           applied_at timestamptz not null default now()
         )`,
      );
      const { rows } = await client.query<{ name: string }>(
        'select name from schema_migrations',
      );
      const done = new Set(rows.map((r) => r.name));
      for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(join(this.dir, file), 'utf8');
        try {
          await client.query('begin');
          await client.query(sql);
          await client.query(
            'insert into schema_migrations (name) values ($1)',
            [file],
          );
          await client.query('commit');
        } catch (error) {
          await client.query('rollback').catch(() => undefined);
          throw error;
        }
        applied.push(file);
        this.logger.log(`applied ${file}`);
      }
    } finally {
      await client
        .query('select pg_advisory_unlock($1)', [MIGRATION_LOCK])
        .catch(() => undefined);
      client.release();
    }
    return applied;
  }
}
