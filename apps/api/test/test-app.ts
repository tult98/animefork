import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach } from 'vitest';
import { AppModule } from '../src/app.module.ts';
import { configureApp } from '../src/app.setup.ts';
import { AUTH_STORE, type AuthStore } from '../src/auth/auth.store.ts';
import { SESSION_COOKIE } from '../src/auth/cookie.ts';
import { FakeMailer, MAILER } from '../src/auth/mailer.ts';
import { generateToken, hashToken } from '../src/auth/tokens.ts';
import { CLOCK } from '../src/common/clock.ts';
import { APP_CONFIG, ENV, type Env } from '../src/config/app.config.ts';
import { TEST_DATABASE_URL } from './test-database.ts';

const DAY_MS = 24 * 60 * 60_000;

const apps: NestExpressApplication[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

export async function buildApp(options: { env?: Env; now?: Date } = {}) {
  let now = (options.now ?? new Date('2026-03-01T00:00:00Z')).getTime();
  const clock = () => new Date(now);
  const mailer = new FakeMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue({
      DATABASE_URL: TEST_DATABASE_URL,
      TMDB_API_KEY: 'key',
      ALLOWED_ORIGINS: 'https://web.test',
      RATE_LIMIT_PER_MINUTE: '1000',
      ...options.env,
    })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app, app.get(APP_CONFIG));
  await app.init();
  apps.push(app);

  // Opens a session without the sign-up flow, which runs scrypt and would slow every test that only needs a user.
  const signedIn = async (email: string): Promise<string> => {
    const store = app.get<AuthStore>(AUTH_STORE);
    const signup = hashToken(generateToken());
    await store.createPendingSignup(
      {
        tokenHash: signup,
        email,
        passwordHash: 'unused',
        createdAt: clock(),
        expiresAt: new Date(now + DAY_MS),
      },
      1,
    );
    const user = await store.confirmSignup(signup, clock());
    if (!user) throw new Error(`could not create the user ${email}`);
    const token = generateToken();
    await store.createSession(
      user.id,
      hashToken(token),
      clock(),
      new Date(now + 30 * DAY_MS),
    );
    return `${SESSION_COOKIE}=${token}`;
  };

  return {
    app,
    http: () => request(app.getHttpServer()),
    advance: (ms: number) => {
      now += ms;
    },
    mailer,
    signedIn,
  };
}
