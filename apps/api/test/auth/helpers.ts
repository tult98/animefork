import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, expect } from 'vitest';
import { ART_SYNC } from '../../src/art/art.filler.ts';
import { ART_STORE } from '../../src/art/art.store.ts';
import {
  AUTH_CLEANUP_EVERY_MS,
  AuthService,
} from '../../src/auth/auth.service.ts';
import { AUTH_STORE, MemoryAuthStore } from '../../src/auth/auth.store.ts';
import { FakeMailer, MAILER } from '../../src/auth/mailer.ts';
import { AppModule } from '../../src/app.module.ts';
import { configureApp } from '../../src/app.setup.ts';
import { CLOCK } from '../../src/common/clock.ts';
import { APP_CONFIG, ENV, type Env } from '../../src/config/app.config.ts';
import {
  MigrationRunner,
  PG_POOL,
} from '../../src/database/migration-runner.ts';
import { MAL_STORE, MemoryMalStore } from '../../src/mal/mal.store.ts';
import { RATINGS_STORE } from '../../src/ratings/ratings.store.ts';
import {
  MemoryWatchProgressStore,
  WATCH_PROGRESS_STORE,
} from '../../src/watch-progress/watch-progress.store.ts';
import { setup } from '../art/helpers.ts';

export const ORIGIN = 'https://web.test';
export const DAY_MS = 24 * 60 * 60_000;
export const START = new Date('2026-03-01T00:00:00Z');

const BASE_ENV: Env = {
  DATABASE_URL: 'postgres://unused@localhost:1/unused',
  TMDB_API_KEY: 'key',
  ALLOWED_ORIGINS: ORIGIN,
  RATE_LIMIT_PER_MINUTE: '1000',
};

const apps: NestExpressApplication[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

export async function buildAuthApp(env: Env = {}) {
  let now = START.getTime();
  const clock = () => new Date(now);
  const advance = (ms: number) => {
    now += ms;
  };
  const store = new MemoryAuthStore();
  const mailer = new FakeMailer();
  const art = setup();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue({ ...BASE_ENV, ...env })
    .overrideProvider(PG_POOL)
    .useValue({ end: async () => undefined })
    .overrideProvider(MigrationRunner)
    .useValue({})
    .overrideProvider(ART_STORE)
    .useValue(art.store)
    .overrideProvider(RATINGS_STORE)
    .useValue(art.ratings)
    .overrideProvider(MAL_STORE)
    .useValue(new MemoryMalStore())
    .overrideProvider(ART_SYNC)
    .useValue(art.sync)
    .overrideProvider(AUTH_STORE)
    .useValue(store)
    .overrideProvider(WATCH_PROGRESS_STORE)
    .useValue(new MemoryWatchProgressStore())
    .overrideProvider(MAILER)
    .useValue(mailer)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(AUTH_CLEANUP_EVERY_MS)
    .useValue(null)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app, app.get(APP_CONFIG));
  await app.init();
  apps.push(app);

  const http = () => request(app.getHttpServer());
  const post = (path: string, body?: unknown, cookie?: string) => {
    const req = http().post(path).set('content-type', 'application/json');
    if (cookie !== undefined) req.set('cookie', `session=${cookie}`);
    return body === undefined ? req : req.send(JSON.stringify(body));
  };
  const get = (path: string, cookie?: string) => {
    const req = http().get(path);
    return cookie === undefined ? req : req.set('cookie', `session=${cookie}`);
  };
  const put = (path: string, body?: unknown, cookie?: string) => {
    const req = http().put(path).set('content-type', 'application/json');
    if (cookie !== undefined) req.set('cookie', `session=${cookie}`);
    return body === undefined ? req : req.send(JSON.stringify(body));
  };
  const lastToken = () => {
    const text = mailer.sent.at(-1)?.text ?? '';
    const token = /#token=([\w-]+)/.exec(text)?.[1];
    if (!token) throw new Error('the last mail has no verification link');
    return token;
  };
  return {
    app,
    http,
    post,
    put,
    get,
    store,
    mailer,
    advance,
    lastToken,
    auth: app.get(AuthService),
  };
}

export function setCookieOf(res: { headers: Record<string, unknown> }): string {
  const header = res.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : [];
  const session = cookies.find(
    (c): c is string => typeof c === 'string' && c.startsWith('session='),
  );
  expect(session, 'response sets the session cookie').toBeDefined();
  return session ?? '';
}

export function sessionValueOf(res: { headers: Record<string, unknown> }) {
  return /^session=([^;]*)/.exec(setCookieOf(res))?.[1] ?? '';
}

export function maxAgeOf(res: { headers: Record<string, unknown> }) {
  return Number(/Max-Age=(\d+)/.exec(setCookieOf(res))?.[1]);
}
