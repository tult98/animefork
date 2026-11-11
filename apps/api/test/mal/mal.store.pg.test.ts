import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../../src/database/migration-runner.ts';
import { PostgresMalStore, type StoredMal } from '../../src/mal/mal.store.ts';

const url = process.env.DATABASE_URL;
const prefix = `test-${process.pid}-${Date.now()}`;
const slug = (name: string) => `${prefix}-${name}`;

const ok = (s: string, over: Partial<StoredMal> = {}): StoredMal => ({
  slug: s,
  status: 'ok',
  malId: 34572,
  score: 7.55,
  voters: 69596,
  rank: 2006,
  popularity: 1762,
  members: 157000,
  matchedTitle: 'Black Clover',
  matchScore: 0.987,
  matcherVersion: 1,
  reason: null,
  attemptedAt: new Date('2026-01-01T00:00:00Z'),
  fetchedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe.skipIf(!url)('PostgresMalStore against DATABASE_URL', () => {
  let pool: pg.Pool;
  let store: PostgresMalStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await new MigrationRunner(pool, DEFAULT_MIGRATIONS_DIR).run();
    store = new PostgresMalStore(pool);
  });

  afterAll(async () => {
    await pool.query(`delete from title_mal where source_slug like $1`, [
      `${prefix}-%`,
    ]);
    await pool.end();
  });

  it('round-trips a matched row, keeping two decimals and nulls', async () => {
    const a = slug('a');
    const b = slug('b');
    await store.save(ok(a));
    await store.save(ok(b, { rank: null, score: null, voters: null }));
    const found = await store.find([a, b, slug('missing')]);
    expect(found.size).toBe(2);
    expect(found.get(a)).toEqual(ok(a));
    expect(found.get(b)).toMatchObject({
      rank: null,
      score: null,
      voters: null,
    });
  });

  it('replaces a row on save, including a refresh of its numbers', async () => {
    const s = slug('replace');
    await store.save(ok(s));
    await store.save(ok(s, { score: 8.01, rank: 5 }));
    expect((await store.find([s])).get(s)).toMatchObject({
      score: 8.01,
      rank: 5,
    });
  });

  it('stores a miss without an id, and touch moves only the attempt time', async () => {
    const s = slug('miss');
    await store.save({
      ...ok(s),
      status: 'none',
      malId: null,
      score: null,
      voters: null,
      rank: null,
      popularity: null,
      members: null,
      matchedTitle: null,
      matchScore: null,
      reason: 'no candidate cleared the match',
      fetchedAt: null,
    });
    const before = (await store.find([s])).get(s)!;
    await store.touch(s);
    const after = (await store.find([s])).get(s)!;
    expect(after.attemptedAt.getTime()).toBeGreaterThan(
      before.attemptedAt.getTime(),
    );
    expect({ ...after, attemptedAt: before.attemptedAt }).toEqual(before);
  });

  it('refuses an ok row with no id and an out-of-range score', async () => {
    await expect(
      store.save(ok(slug('noid'), { malId: null })),
    ).rejects.toThrow();
    await expect(
      store.save(ok(slug('big'), { score: 10.5 })),
    ).rejects.toThrow();
  });
});
