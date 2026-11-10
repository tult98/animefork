import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../../src/database/migration-runner.ts';

const url = process.env.DATABASE_URL;
const tag = `test_${process.pid}_${Date.now()}`;

describe.skipIf(!url)('MigrationRunner against DATABASE_URL', () => {
  let pool: pg.Pool;
  let dir: string;
  const files = [`900_${tag}_a.sql`, `901_${tag}_b.sql`];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    dir = await mkdtemp(join(tmpdir(), 'api-migrations-'));
    await writeFile(
      join(dir, files[1]!),
      `alter table ${tag} add column b int;`,
    );
    await writeFile(join(dir, files[0]!), `create table ${tag} (a int);`);
    await writeFile(join(dir, 'README.md'), 'not a migration');
  });

  afterAll(async () => {
    await pool.query(`drop table if exists ${tag}`);
    await pool.query('delete from schema_migrations where name = any($1)', [
      files,
    ]);
    await pool.end();
    await rm(dir, { recursive: true, force: true });
  });

  it('applies pending files in order once and records each', async () => {
    const runner = new MigrationRunner(pool, dir);
    expect(await runner.run()).toEqual(files);
    expect(await runner.run()).toEqual([]);
    const { rows } = await pool.query<{ name: string; applied_at: Date }>(
      'select name, applied_at from schema_migrations where name = any($1) order by name',
      [files],
    );
    expect(rows.map((r) => r.name)).toEqual(files);
    expect(rows[0]?.applied_at).toBeInstanceOf(Date);
    const columns = await pool.query(
      'select column_name from information_schema.columns where table_name = $1 order by column_name',
      [tag],
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual(['a', 'b']);
  });

  it('records the art migration and leaves it alone on a second boot', async () => {
    const runner = new MigrationRunner(pool, DEFAULT_MIGRATIONS_DIR);
    await runner.run();
    expect(await runner.run()).toEqual([]);
    const { rows } = await pool.query(
      `select name from schema_migrations where name = '001_art.sql'`,
    );
    expect(rows).toHaveLength(1);
  });
});
