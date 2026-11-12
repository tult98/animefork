import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresAuthStore } from '../src/auth/auth.store.ts';
import { generateToken, hashToken } from '../src/auth/tokens.ts';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../src/database/migration-runner.ts';

const url = process.env.DATABASE_URL;
const prefix = `test-${process.pid}-${Date.now()}`;
const email = (name: string) => `${prefix}-${name}@example.test`;
const DAY_MS = 24 * 60 * 60_000;
const daysFrom = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_MS);

describe.skipIf(!url)('PostgresAuthStore against DATABASE_URL', () => {
  let pool: pg.Pool;
  let store: PostgresAuthStore;
  const now = new Date();

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await new MigrationRunner(pool, DEFAULT_MIGRATIONS_DIR).run();
    store = new PostgresAuthStore(pool);
  });

  afterAll(async () => {
    for (const table of ['users', 'pending_signups']) {
      await pool.query(`delete from ${table} where lower(email) like $1`, [
        `${prefix}-%`,
      ]);
    }
    await pool.end();
  });

  async function pending(
    address: string,
    passwordHash = 'hash',
    createdAt = now,
    expiresAt = daysFrom(createdAt, 1),
  ) {
    const tokenHash = hashToken(generateToken());
    await store.createPendingSignup(
      { tokenHash, email: address, passwordHash, createdAt, expiresAt },
      5,
    );
    return tokenHash;
  }

  async function confirmedUser(name: string) {
    const user = await store.confirmSignup(await pending(email(name)), now);
    if (!user) throw new Error('could not confirm the test user');
    return user;
  }

  async function pendingCount(address: string) {
    const { rows } = await pool.query<{ count: number }>(
      `select count(*)::int as count from pending_signups where lower(email) = lower($1)`,
      [address],
    );
    return rows[0]?.count;
  }

  it('creates the user from the pending row with that row’s own hash, and deletes the other rows for the email', async () => {
    const first = await pending(email('own-hash'), 'first');
    await pending(email('own-hash'), 'second');
    const user = await store.confirmSignup(first, now);
    expect(user).toEqual({
      id: expect.any(String),
      email: email('own-hash'),
      passwordHash: 'first',
      createdAt: now,
    });
    expect(await store.findUserByEmail(email('OWN-HASH'))).toEqual(user);
    expect(await pendingCount(email('own-hash'))).toBe(0);
  });

  it('keeps one user per email whatever its case', async () => {
    const user = await confirmedUser('case');
    const upper = await pending(email('case').toUpperCase(), 'other');
    expect(await store.confirmSignup(upper, now)).toBeNull();
    expect(await store.findUserByEmail(email('CASE'))).toEqual(user);
    expect(await pendingCount(email('case'))).toBe(0);
    await expect(
      pool.query(`insert into users (email, password_hash) values ($1, 'x')`, [
        email('case').toUpperCase(),
      ]),
    ).rejects.toThrow(/users_email_key/);
  });

  it('lets exactly one of two parallel confirms of a token win', async () => {
    const token = await pending(email('race'));
    const results = await Promise.all([
      store.confirmSignup(token, now),
      store.confirmSignup(token, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.confirmSignup(token, now)).toBeNull();
  });

  it('creates one user when several links for one email are confirmed at once', async () => {
    const tokens = [];
    for (let i = 0; i < 4; i++) {
      tokens.push(await pending(email('sibling-race'), `hash-${i}`));
    }
    const results = await Promise.all(
      tokens.map((token) => store.confirmSignup(token, now)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const { rows } = await pool.query(
      `select id from users where lower(email) = lower($1)`,
      [email('sibling-race')],
    );
    expect(rows).toHaveLength(1);
    expect(await pendingCount(email('sibling-race'))).toBe(0);
  });

  it('does not wait on a sibling row that another confirm is deleting', async () => {
    const mine = await pending(email('held'), 'mine');
    const held = await pending(email('held'), 'held');
    const other = await pool.connect();
    try {
      await other.query('begin');
      await other.query(`delete from pending_signups where token_hash = $1`, [
        held,
      ]);
      expect((await store.confirmSignup(mine, now))?.passwordHash).toBe('mine');
      await other.query('commit');
    } finally {
      other.release();
    }
    expect(await pendingCount(email('held'))).toBe(0);
  });

  it('refuses an expired token', async () => {
    const token = await pending(email('expired'));
    expect(await store.confirmSignup(token, daysFrom(now, 1))).toBeNull();
    expect(await store.findUserByEmail(email('expired'))).toBeNull();
    expect(await pendingCount(email('expired'))).toBe(1);
  });

  it('keeps the 5 newest pending sign-ups per email', async () => {
    for (let i = 0; i < 7; i++) {
      await pending(
        email('cap'),
        `hash-${i}`,
        new Date(now.getTime() + i * 1000),
      );
    }
    const { rows } = await pool.query<{ password_hash: string }>(
      `select password_hash from pending_signups where email = $1 order by created_at`,
      [email('cap')],
    );
    expect(rows.map((r) => r.password_hash)).toEqual([
      'hash-2',
      'hash-3',
      'hash-4',
      'hash-5',
      'hash-6',
    ]);
  });

  it('deletes sessions with their user', async () => {
    const user = await confirmedUser('cascade');
    await store.createSession(
      user.id,
      hashToken(generateToken()),
      now,
      daysFrom(now, 30),
    );
    await pool.query(`delete from users where id = $1`, [user.id]);
    const { rows } = await pool.query(
      `select count(*)::int as sessions from sessions where user_id = $1`,
      [user.id],
    );
    expect(rows[0]).toEqual({ sessions: 0 });
  });

  it('finds, touches and deletes a session by its token hash', async () => {
    const user = await confirmedUser('session');
    const hash = hashToken(generateToken());
    const created = await store.createSession(
      user.id,
      hash,
      now,
      daysFrom(now, 30),
    );
    const found = await store.findSession(hash);
    expect(found?.session).toEqual(created);
    expect(found?.user).toEqual(user);
    await store.touchSession(created.id, daysFrom(now, 2), daysFrom(now, 32));
    expect((await store.findSession(hash))?.session).toMatchObject({
      lastSeenAt: daysFrom(now, 2),
      expiresAt: daysFrom(now, 32),
    });
    await store.deleteSession(hash);
    expect(await store.findSession(hash)).toBeNull();
  });

  it('cleans up only expired pending sign-ups and sessions', async () => {
    const live = await confirmedUser('live');
    const expiredSession = hashToken(generateToken());
    const liveSession = hashToken(generateToken());
    await store.createSession(live.id, expiredSession, now, now);
    await store.createSession(live.id, liveSession, now, daysFrom(now, 1));
    await pending(email('stale-signup'), 'hash', daysFrom(now, -1), now);
    await pending(email('live-signup'));

    const counts = await store.deleteStale(now);

    expect(counts.pendingSignups).toBeGreaterThanOrEqual(1);
    expect(counts.sessions).toBeGreaterThanOrEqual(1);
    expect(await store.findSession(expiredSession)).toBeNull();
    expect(await store.findSession(liveSession)).not.toBeNull();
    expect(await pendingCount(email('stale-signup'))).toBe(0);
    expect(await pendingCount(email('live-signup'))).toBe(1);
    expect(await store.findUserByEmail(live.email)).toEqual(live);
  });
});
