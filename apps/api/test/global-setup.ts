import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import pg from 'pg';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../src/database/migration-runner.ts';
import { TEST_DATABASE_URL } from './test-database.ts';

export default async function setup(): Promise<void> {
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  // This file empties every table, so it must never run against the database the dev server uses.
  if (!/^\w+_test$/.test(name)) {
    throw new Error(
      `the test database must be named like api_test, got "${name}"`,
    );
  }

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.href });
  try {
    await admin.connect();
  } catch (cause) {
    throw new Error(
      'the test database is unreachable, start it with `docker compose up -d` in apps/api',
      { cause },
    );
  }
  try {
    const { rowCount } = await admin.query(
      'select 1 from pg_database where datname = $1',
      [name],
    );
    if (!rowCount) await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }

  Logger.overrideLogger(false);
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await new MigrationRunner(pool, DEFAULT_MIGRATIONS_DIR).run();
    const { rows } = await pool.query<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public' and tablename <> 'schema_migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
      await pool.query(`truncate ${tables} restart identity cascade`);
    }
  } finally {
    await pool.end();
  }
}
