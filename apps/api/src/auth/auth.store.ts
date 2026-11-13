import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../database/migration-runner.ts';

export const AUTH_STORE = Symbol('AuthStore');

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface PendingSignup {
  tokenHash: Buffer;
  email: string;
  passwordHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface SessionWithUser {
  session: Session;
  user: User;
}

export interface StaleCounts {
  pendingSignups: number;
  sessions: number;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<User | null>;
  createPendingSignup(signup: PendingSignup, keep: number): Promise<void>;
  confirmSignup(tokenHash: Buffer, now: Date): Promise<User | null>;
  createSession(
    userId: string,
    tokenHash: Buffer,
    now: Date,
    expiresAt: Date,
  ): Promise<Session>;
  findSession(tokenHash: Buffer): Promise<SessionWithUser | null>;
  touchSession(
    sessionId: string,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<void>;
  deleteSession(tokenHash: Buffer): Promise<void>;
  deleteStale(now: Date): Promise<StaleCounts>;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

interface SessionUserRow {
  id: string;
  user_id: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  email: string;
  password_hash: string;
  user_created_at: Date;
}

const USER_COLUMNS = 'id, email, password_hash, created_at';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

@Injectable()
export class PostgresAuthStore implements AuthStore {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(
      `select ${USER_COLUMNS} from users where lower(email) = lower($1)`,
      [email],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async createPendingSignup(
    signup: PendingSignup,
    keep: number,
  ): Promise<void> {
    const olderToKeep = keep - 1;
    await this.pool.query(
      `with added as (
         insert into pending_signups (token_hash, email, password_hash, created_at, expires_at)
         values ($1, $2, $3, $4, $5)
       )
       delete from pending_signups
        where token_hash in (
          select token_hash from pending_signups
           where lower(email) = lower($2)
           order by created_at desc
           offset $6
        )`,
      [
        signup.tokenHash,
        signup.email,
        signup.passwordHash,
        signup.createdAt,
        signup.expiresAt,
        olderToKeep,
      ],
    );
  }

  async confirmSignup(tokenHash: Buffer, now: Date): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(
      `with confirmed as (
         delete from pending_signups
          where token_hash = $1 and expires_at > $2
         returning email, password_hash
       ), created as (
         insert into users (email, password_hash, created_at)
         select email, password_hash, $2 from confirmed
         on conflict ((lower(email))) do nothing
         returning ${USER_COLUMNS}
       ), siblings as (
         select token_hash from pending_signups
          where lower(email) = (select lower(email) from confirmed)
            and token_hash <> $1
          for update skip locked
       ), cleared as (
         delete from pending_signups
          where token_hash in (select token_hash from siblings)
       )
       select ${USER_COLUMNS} from created`,
      [tokenHash, now],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async createSession(
    userId: string,
    tokenHash: Buffer,
    now: Date,
    expiresAt: Date,
  ): Promise<Session> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
       values ($1, $2, $3, $3, $4)
       returning id`,
      [tokenHash, userId, now, expiresAt],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('createSession returned no row');
    return { id, userId, createdAt: now, lastSeenAt: now, expiresAt };
  }

  async findSession(tokenHash: Buffer): Promise<SessionWithUser | null> {
    const { rows } = await this.pool.query<SessionUserRow>(
      `select s.id, s.user_id, s.created_at, s.last_seen_at, s.expires_at,
              u.email, u.password_hash, u.created_at as user_created_at
         from sessions s join users u on u.id = s.user_id
        where s.token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      session: {
        id: row.id,
        userId: row.user_id,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        expiresAt: row.expires_at,
      },
      user: {
        id: row.user_id,
        email: row.email,
        passwordHash: row.password_hash,
        createdAt: row.user_created_at,
      },
    };
  }

  async touchSession(
    sessionId: string,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `update sessions set last_seen_at = $2, expires_at = $3 where id = $1`,
      [sessionId, lastSeenAt, expiresAt],
    );
  }

  async deleteSession(tokenHash: Buffer): Promise<void> {
    await this.pool.query(`delete from sessions where token_hash = $1`, [
      tokenHash,
    ]);
  }

  async deleteStale(now: Date): Promise<StaleCounts> {
    const pendingSignups = await this.pool.query(
      `delete from pending_signups where expires_at <= $1`,
      [now],
    );
    const sessions = await this.pool.query(
      `delete from sessions where expires_at <= $1`,
      [now],
    );
    return {
      pendingSignups: pendingSignups.rowCount ?? 0,
      sessions: sessions.rowCount ?? 0,
    };
  }
}
