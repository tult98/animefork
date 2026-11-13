import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { MigrationRunner } from '../../src/database/migration-runner.ts';
import { TEST_DATABASE_URL } from '../test-database.ts';

describe('migration runner', () => {
  it('applies the pending migration files in name order, records each, and applies none on the next boot', async () => {
    const table = `test_${randomUUID().replaceAll('-', '')}`;
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    const dir = await mkdtemp(join(tmpdir(), 'api-migrations-'));
    await writeFile(
      join(dir, `901_${table}_b.sql`),
      `alter table ${table} add column b int;`,
    );
    await writeFile(
      join(dir, `900_${table}_a.sql`),
      `create table ${table} (a int);`,
    );
    await writeFile(join(dir, 'README.md'), 'not a migration');
    const runner = new MigrationRunner(pool, dir);

    try {
      const firstBoot = await runner.run();
      const secondBoot = await runner.run();

      expect(firstBoot).toEqual([`900_${table}_a.sql`, `901_${table}_b.sql`]);
      expect(secondBoot).toEqual([]);
      const recorded = await pool.query(
        'select name from schema_migrations where name like $1 order by name',
        [`%${table}%`],
      );
      expect(recorded.rows).toEqual([
        { name: `900_${table}_a.sql` },
        { name: `901_${table}_b.sql` },
      ]);
      const columns = await pool.query(
        'select column_name from information_schema.columns where table_name = $1 order by column_name',
        [table],
      );
      expect(columns.rows).toEqual([
        { column_name: 'a' },
        { column_name: 'b' },
      ]);
    } finally {
      // The test database is shared, so the table and its two records must not outlive this test.
      await pool.query(`drop table if exists ${table}`);
      await pool.query('delete from schema_migrations where name like $1', [
        `%${table}%`,
      ]);
      await pool.end();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
