import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresRatingsStore } from '../src/ratings/ratings.store.ts';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../src/database/migration-runner.ts';

const url = process.env.DATABASE_URL;
const prefix = `test-${process.pid}-${Date.now()}`;
const slug = (name: string) => `${prefix}-${name}`;

describe.skipIf(!url)('PostgresRatingsStore against DATABASE_URL', () => {
  let pool: pg.Pool;
  let store: PostgresRatingsStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await new MigrationRunner(pool, DEFAULT_MIGRATIONS_DIR).run();
    store = new PostgresRatingsStore(pool);
  });

  afterAll(async () => {
    await pool.query(`delete from title_ratings where source_slug like $1`, [
      `${prefix}-%`,
    ]);
    await pool.end();
  });

  it('stores a batch and reads it back', async () => {
    const a = slug('a');
    const b = slug('b');
    await store.saveAvs([
      { slug: a, score: 8.24, voters: 1284, quality: 'HD' },
      { slug: b, score: 6, voters: 0 },
    ]);
    const found = await store.find([a, b, slug('missing')]);
    expect(found.size).toBe(2);
    expect(found.get(a)).toMatchObject({
      avsScore: 8.2,
      avsVoters: 1284,
      quality: 'HD',
    });
    expect(found.get(a)?.avsFetchedAt).toBeInstanceOf(Date);
    expect(found.get(b)).toMatchObject({ avsScore: 6, quality: null });
  });

  it('keeps the last item when a batch repeats a slug', async () => {
    const s = slug('dup');
    await store.saveAvs([
      { slug: s, score: 7, voters: 1 },
      { slug: s, score: 9, voters: 5 },
    ]);
    expect((await store.find([s])).get(s)).toMatchObject({
      avsScore: 9,
      avsVoters: 5,
    });
  });

  it('ignores a rewrite of a fresh row, and replaces an old one keeping its quality', async () => {
    const s = slug('rewrite');
    await store.saveAvs([{ slug: s, score: 7, voters: 1, quality: 'FHD' }]);
    await store.saveAvs([{ slug: s, score: 1, voters: 99 }]);
    expect((await store.find([s])).get(s)).toMatchObject({ avsScore: 7 });

    await pool.query(
      `update title_ratings set avs_fetched_at = now() - interval '2 hours'
        where source_slug = $1`,
      [s],
    );
    await store.saveAvs([{ slug: s, score: 6, voters: 2 }]);
    expect((await store.find([s])).get(s)).toMatchObject({
      avsScore: 6,
      avsVoters: 2,
      quality: 'FHD',
    });
  });

  it('rejects a score outside 0 to 10 at the database', async () => {
    await expect(
      pool.query(
        `insert into title_ratings (source_slug, avs_score, avs_voters, avs_fetched_at)
         values ($1, 11, 1, now())`,
        [slug('bad')],
      ),
    ).rejects.toThrow();
  });
});
