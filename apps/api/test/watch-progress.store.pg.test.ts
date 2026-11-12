import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresAuthStore } from '../src/auth/auth.store.ts';
import { generateToken, hashToken } from '../src/auth/tokens.ts';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../src/database/migration-runner.ts';
import type { WatchProgressRow } from '../src/watch-progress/watch-progress.ts';
import { PostgresWatchProgressStore } from '../src/watch-progress/watch-progress.store.ts';

const url = process.env.DATABASE_URL;
const prefix = `test-${process.pid}-${Date.now()}`;
const slug = (name: string) => `${prefix}-${name}`;
const T0 = Date.parse('2026-03-01T00:00:00Z');

describe.skipIf(!url)('PostgresWatchProgressStore against DATABASE_URL', () => {
  let pool: pg.Pool;
  let store: PostgresWatchProgressStore;
  let ana: string;
  let ben: string;

  async function user(name: string): Promise<string> {
    const auth = new PostgresAuthStore(pool);
    const now = new Date();
    const tokenHash = hashToken(generateToken());
    await auth.createPendingSignup(
      {
        tokenHash,
        email: `${prefix}-${name}@example.test`,
        passwordHash: 'hash',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      },
      5,
    );
    const created = await auth.confirmSignup(tokenHash, now);
    if (!created) throw new Error('could not create the test user');
    return created.id;
  }

  function row(overrides: Partial<WatchProgressRow> = {}): WatchProgressRow {
    return {
      userId: ana,
      slug: slug('show'),
      episodeId: '1',
      positionS: 10.5,
      durationS: 1400,
      completed: false,
      titleName: 'Show',
      image: 'https://img.test/show.jpg',
      episodeLabel: 'Episode 1',
      seasonSlug: null,
      updatedAt: new Date(T0),
      ...overrides,
    };
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await new MigrationRunner(pool, DEFAULT_MIGRATIONS_DIR).run();
    store = new PostgresWatchProgressStore(pool);
    ana = await user('ana');
    ben = await user('ben');
  });

  afterAll(async () => {
    await pool.query(`delete from users where lower(email) like $1`, [
      `${prefix}-%`,
    ]);
    await pool.end();
  });

  it('saves a row and reads it back', async () => {
    const s = slug('roundtrip');
    const stored = await store.save(row({ slug: s, seasonSlug: 'season-2' }));
    expect(stored).toEqual(row({ slug: s, seasonSlug: 'season-2' }));
    expect(await store.forSlug(ana, s)).toEqual([
      row({ slug: s, seasonSlug: 'season-2' }),
    ]);
  });

  it('upserts in place and never unsets completed', async () => {
    const s = slug('upsert');
    await store.save(row({ slug: s, positionS: 1390, completed: true }));
    const stored = await store.save(
      row({
        slug: s,
        positionS: 20,
        completed: false,
        titleName: 'Renamed',
        updatedAt: new Date(T0 + 1000),
      }),
    );
    expect(stored).toMatchObject({
      positionS: 20,
      completed: true,
      titleName: 'Renamed',
      updatedAt: new Date(T0 + 1000),
    });
    const rows = await store.forSlug(ana, s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      positionS: 20,
      completed: true,
      titleName: 'Renamed',
      updatedAt: new Date(T0 + 1000),
    });
  });

  it('lists episodes in numeric order', async () => {
    const s = slug('order');
    await store.save(row({ slug: s, episodeId: '10' }));
    await store.save(row({ slug: s, episodeId: '9' }));
    expect((await store.forSlug(ana, s)).map((r) => r.episodeId)).toEqual([
      '9',
      '10',
    ]);
  });

  it('returns the newest row per slug, newest first, within the limit and per user', async () => {
    const a = slug('latest-a');
    const b = slug('latest-b');
    const c = slug('latest-c');
    await store.save(
      row({ slug: a, episodeId: '1', updatedAt: new Date(T0 + 10_000) }),
    );
    await store.save(
      row({ slug: a, episodeId: '2', updatedAt: new Date(T0 + 40_000) }),
    );
    await store.save(row({ slug: b, updatedAt: new Date(T0 + 30_000) }));
    await store.save(row({ slug: c, updatedAt: new Date(T0 + 20_000) }));
    await store.save(
      row({ userId: ben, slug: c, updatedAt: new Date(T0 + 90_000) }),
    );

    const mine = (await store.latestPerSlug(ana, 1000)).filter((r) =>
      r.slug.startsWith(`${prefix}-latest-`),
    );
    expect(mine.map((r) => [r.slug, r.episodeId])).toEqual([
      [a, '2'],
      [b, '1'],
      [c, '1'],
    ]);
    expect(await store.latestPerSlug(ana, 2)).toHaveLength(2);
    expect((await store.latestPerSlug(ben, 1000)).map((r) => r.userId)).toEqual(
      [ben],
    );
  });

  it('removes a user’s progress with the user', async () => {
    const gone = await user('gone');
    const s = slug('cascade');
    await store.save(row({ userId: gone, slug: s }));
    await pool.query(`delete from users where id = $1`, [gone]);
    expect(await store.forSlug(gone, s)).toEqual([]);
  });

  it('rejects a duration of zero at the database', async () => {
    await expect(
      store.save(row({ slug: slug('bad'), durationS: 0 })),
    ).rejects.toThrow();
  });
});
