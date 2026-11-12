import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresTitleNamesStore } from '../../src/art/title-names.store.ts';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../../src/database/migration-runner.ts';

const url = process.env.DATABASE_URL;
const prefix = `test-${process.pid}-${Date.now()}`;
const slug = (name: string) => `${prefix}-${name}`;

describe.skipIf(!url)('PostgresTitleNamesStore against DATABASE_URL', () => {
  let pool: pg.Pool;
  let store: PostgresTitleNamesStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await new MigrationRunner(pool, DEFAULT_MIGRATIONS_DIR).run();
    store = new PostgresTitleNamesStore(pool);
  });

  afterAll(async () => {
    await pool.query(`delete from title_names where source_slug like $1`, [
      `${prefix}-%`,
    ]);
    await pool.end();
  });

  it('round-trips names with their time, and finds nothing for an unknown slug', async () => {
    const a = slug('a');
    const at = new Date('2026-01-01T00:00:00.123Z');
    await store.saveIfAbsent(a, ['Douluo Dalu', 'Soul Land'], at);
    expect(await store.find([a, slug('missing')])).toEqual(
      new Map([[a, { names: ['Douluo Dalu', 'Soul Land'], updatedAt: at }]]),
    );
    expect(await store.find([])).toEqual(new Map());
  });

  it('keeps the first names saved for a slug', async () => {
    const a = slug('first');
    const at = new Date('2026-01-01T00:00:00Z');
    await store.saveIfAbsent(a, ['Soul Land'], at);
    await store.saveIfAbsent(a, ['Rewritten'], new Date());
    expect((await store.find([a])).get(a)).toEqual({
      names: ['Soul Land'],
      updatedAt: at,
    });
  });
});
