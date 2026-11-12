import { describe, expect, it } from 'vitest';
import {
  ME_PATH,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  SIGN_UP_PATH,
  VERIFY_EMAIL_PATH,
} from '../../src/auth/contract.ts';
import {
  buildAuthApp,
  DAY_MS,
  maxAgeOf,
  ORIGIN,
  sessionValueOf,
  setCookieOf,
} from './helpers.ts';

const EMAIL = 'ana@example.test';
const PASSWORD = 'correct horse battery';
const INVALID_TOKEN = { error: 'invalid_token' };
const INVALID_CREDENTIALS = { error: 'invalid_credentials' };

type App = Awaited<ReturnType<typeof buildAuthApp>>;

async function signUp(app: App, email = EMAIL, password = PASSWORD) {
  const res = await app.post(SIGN_UP_PATH, { email, password });
  expect(res.status).toBe(202);
  return res;
}

async function signIn(app: App, email = EMAIL, password = PASSWORD) {
  return app.post(SIGN_IN_PATH, { email, password });
}

async function signedIn(app: App) {
  await signUp(app);
  const res = await app.post(VERIFY_EMAIL_PATH, { token: app.lastToken() });
  expect(res.status).toBe(200);
  const session = await signIn(app);
  expect(session.status).toBe(200);
  return sessionValueOf(session);
}

describe('account pre-hijack', () => {
  it('keeps the owner’s password when someone else signs up the same email after them', async () => {
    const app = await buildAuthApp();
    await signUp(app, EMAIL, PASSWORD);
    const ownerLink = app.lastToken();
    await signUp(app, EMAIL, 'attacker password');

    const verified = await app.post(VERIFY_EMAIL_PATH, { token: ownerLink });
    const attacker = await signIn(app, EMAIL, 'attacker password');
    expect(attacker.status).toBe(401);
    expect(attacker.body).toEqual(INVALID_CREDENTIALS);
    expect(verified.status).toBe(200);
    expect((await signIn(app)).status).toBe(200);
  });

  it('keeps the owner’s password when someone else signed up the same email before them', async () => {
    const app = await buildAuthApp();
    await signUp(app, EMAIL, 'attacker password');
    await signUp(app, EMAIL, PASSWORD);

    expect(
      (await app.post(VERIFY_EMAIL_PATH, { token: app.lastToken() })).status,
    ).toBe(200);
    expect((await signIn(app, EMAIL, 'attacker password')).status).toBe(401);
    expect((await signIn(app)).status).toBe(200);
  });

  it.each([0, 1])(
    'creates the account once, with the password of whichever link is confirmed first (link %i)',
    async (first) => {
      const app = await buildAuthApp();
      const passwords = ['first password', 'second password'];
      const links = [];
      for (const password of passwords) {
        await signUp(app, EMAIL, password);
        links.push(app.lastToken());
      }
      const second = 1 - first;

      const confirmed = await app.post(VERIFY_EMAIL_PATH, {
        token: links[first],
      });
      expect(confirmed.status).toBe(200);
      const again = await app.post(VERIFY_EMAIL_PATH, {
        token: links[second],
      });
      expect(again.status).toBe(400);
      expect(again.body).toEqual(INVALID_TOKEN);

      expect(app.store.users.size).toBe(1);
      expect(app.store.pendingSignups.size).toBe(0);
      expect((await signIn(app, EMAIL, passwords[first])).status).toBe(200);
      expect((await signIn(app, EMAIL, passwords[second])).status).toBe(401);
    },
  );
});

describe('sign up and verification', () => {
  it('answers 202 without a session, mails one link, and creates the account without signing in', async () => {
    const app = await buildAuthApp();
    const res = await signUp(app, '  Ana@Example.TEST ');
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(app.mailer.sent).toHaveLength(1);
    expect(app.mailer.sent[0]?.to).toBe(EMAIL);
    expect(app.mailer.sent[0]?.text).toContain(
      `${ORIGIN}/verify-email#token=${app.lastToken()}`,
    );
    expect(app.store.users.size).toBe(0);

    const early = await signIn(app);
    const unknown = await signIn(app, 'nobody@example.test');
    expect(early.status).toBe(401);
    expect(early.body).toEqual(INVALID_CREDENTIALS);
    expect(early.body).toEqual(unknown.body);
    expect(early.headers['set-cookie']).toBeUndefined();

    const verified = await app.post(VERIFY_EMAIL_PATH, {
      token: app.lastToken(),
    });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ ok: true });
    expect(verified.headers['set-cookie']).toBeUndefined();

    const session = await signIn(app);
    expect(session.status).toBe(200);
    expect(session.body).toEqual({
      user: { id: expect.any(String), email: EMAIL },
    });
    const me = await app.get(ME_PATH, sessionValueOf(session));
    expect(me.status).toBe(200);
    expect(me.body).toEqual(session.body);
  });

  it('refuses a used, expired, unknown, tampered or malformed token with the same 400', async () => {
    const app = await buildAuthApp();
    await signUp(app);
    const first = app.lastToken();
    const tampered = `${first.slice(0, -1)}${first.endsWith('A') ? 'B' : 'A'}`;
    const failures = [];

    failures.push(await app.post(VERIFY_EMAIL_PATH, { token: tampered }));
    failures.push(await app.post(VERIFY_EMAIL_PATH, { token: 'x' }));
    failures.push(await app.post(VERIFY_EMAIL_PATH, { token: '' }));

    app.advance(DAY_MS);
    failures.push(await app.post(VERIFY_EMAIL_PATH, { token: first }));

    await signUp(app);
    const second = app.lastToken();
    expect((await app.post(VERIFY_EMAIL_PATH, { token: second })).status).toBe(
      200,
    );
    failures.push(await app.post(VERIFY_EMAIL_PATH, { token: second }));

    for (const res of failures) {
      expect(res.status).toBe(400);
      expect(res.body).toEqual(INVALID_TOKEN);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('answers a sign-up for a confirmed email the same way, mails only a notice and stores nothing', async () => {
    const app = await buildAuthApp();
    await signedIn(app);
    const sentBefore = app.mailer.sent.length;
    const again = await signUp(app, EMAIL, 'another password');
    expect(again.body).toEqual({ ok: true });
    expect(again.headers['set-cookie']).toBeUndefined();
    expect(app.mailer.sent).toHaveLength(sentBefore + 1);
    const notice = app.mailer.sent.at(-1);
    expect(notice?.to).toBe(EMAIL);
    expect(notice?.text).not.toContain('#token=');
    expect(notice?.subject).not.toBe(app.mailer.sent[0]?.subject);
    expect(app.store.pendingSignups.size).toBe(0);

    expect((await signIn(app)).status).toBe(200);
    expect((await signIn(app, EMAIL, 'another password')).status).toBe(401);
  });

  it('keeps the 5 newest pending sign-ups per email', async () => {
    const app = await buildAuthApp();
    const links = [];
    for (let i = 0; i < 6; i++) {
      await signUp(app, EMAIL, `password ${i}`);
      links.push(app.lastToken());
      app.advance(60 * 60_000);
    }
    expect(app.store.pendingSignups.size).toBe(5);
    expect(
      (await app.post(VERIFY_EMAIL_PATH, { token: links[0] })).body,
    ).toEqual(INVALID_TOKEN);
    expect(
      (await app.post(VERIFY_EMAIL_PATH, { token: links[1] })).status,
    ).toBe(200);
    expect((await signIn(app, EMAIL, 'password 1')).status).toBe(200);
  });

  it('answers 400 invalid_request for a bad body', async () => {
    const app = await buildAuthApp();
    for (const [path, body] of [
      [SIGN_UP_PATH, { email: 'not-an-email', password: PASSWORD }],
      [SIGN_UP_PATH, { email: EMAIL, password: 'short' }],
      [SIGN_IN_PATH, { email: EMAIL }],
      [VERIFY_EMAIL_PATH, {}],
    ] as const) {
      const res = await app.post(path, body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'invalid_request' });
    }
    expect(app.mailer.sent).toHaveLength(0);
  });

  it('answers 503 for a sign-up when no web base URL is configured', async () => {
    const app = await buildAuthApp({ ALLOWED_ORIGINS: undefined });
    const res = await app.post(SIGN_UP_PATH, {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(res.status).toBe(503);
    expect(app.store.pendingSignups.size).toBe(0);
  });
});

describe('sign in', () => {
  it('answers an unknown email and a wrong password identically', async () => {
    const app = await buildAuthApp();
    await signedIn(app);
    const unknown = await app.post(SIGN_IN_PATH, {
      email: 'nobody@example.test',
      password: PASSWORD,
    });
    const wrong = await app.post(SIGN_IN_PATH, {
      email: EMAIL,
      password: 'wrong password',
    });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(INVALID_CREDENTIALS);
    expect(wrong.body).toEqual(unknown.body);
    expect(unknown.headers['set-cookie']).toBeUndefined();
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('sets an HttpOnly, Secure, SameSite=Lax session cookie for the session life', async () => {
    const app = await buildAuthApp();
    await signedIn(app);
    const res = await app.post(SIGN_IN_PATH, {
      email: EMAIL,
      password: PASSWORD,
    });
    const cookie = setCookieOf(res);
    expect(cookie).toMatch(/^session=[\w-]{43}; /);
    expect(cookie.split('; ').slice(1)).toEqual([
      `Max-Age=${30 * 24 * 60 * 60}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Secure',
    ]);
  });

  it('drops Secure when COOKIE_SECURE=0 and follows SESSION_TTL_DAYS', async () => {
    const app = await buildAuthApp({
      COOKIE_SECURE: '0',
      SESSION_TTL_DAYS: '7',
    });
    await signedIn(app);
    const res = await app.post(SIGN_IN_PATH, {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(setCookieOf(res)).not.toContain('Secure');
    expect(maxAgeOf(res)).toBe(7 * 24 * 60 * 60);
  });
});

describe('sessions', () => {
  it('answers 401 and clears the cookie without a session', async () => {
    const app = await buildAuthApp();
    for (const cookie of [undefined, '', 'not-a-session']) {
      const res = await app.get(ME_PATH, cookie);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthenticated' });
      expect(maxAgeOf(res)).toBe(0);
    }
  });

  it('slides the expiry only once a day has passed since the last refresh', async () => {
    const app = await buildAuthApp();
    const token = await signedIn(app);

    app.advance(DAY_MS);
    const quiet = await app.get(ME_PATH, token);
    expect(quiet.status).toBe(200);
    expect(quiet.headers['set-cookie']).toBeUndefined();

    app.advance(1);
    const refreshed = await app.get(ME_PATH, token);
    expect(refreshed.status).toBe(200);
    expect(sessionValueOf(refreshed)).toBe(token);
    expect(maxAgeOf(refreshed)).toBe(30 * 24 * 60 * 60);

    app.advance(DAY_MS / 2);
    expect(
      (await app.get(ME_PATH, token)).headers['set-cookie'],
    ).toBeUndefined();
  });

  it('caps the sliding expiry at 90 days after sign-in', async () => {
    const app = await buildAuthApp();
    const token = await signedIn(app);
    for (let day = 20; day <= 80; day += 20) {
      app.advance(20 * DAY_MS);
      const res = await app.get(ME_PATH, token);
      expect(res.status).toBe(200);
      expect(maxAgeOf(res)).toBe(Math.min(30, 90 - day) * 24 * 60 * 60);
    }
    app.advance(9 * DAY_MS);
    expect((await app.get(ME_PATH, token)).status).toBe(200);
    app.advance(DAY_MS);
    const expired = await app.get(ME_PATH, token);
    expect(expired.status).toBe(401);
    expect(maxAgeOf(expired)).toBe(0);
  });

  it('lets an idle session expire, clears the cookie and does not extend it', async () => {
    const app = await buildAuthApp();
    const token = await signedIn(app);
    const [before] = app.store.sessions.values();
    app.advance(30 * DAY_MS);
    const res = await app.get(ME_PATH, token);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthenticated' });
    expect(maxAgeOf(res)).toBe(0);
    expect([...app.store.sessions.values()]).toEqual([before]);
  });

  it('signs out by deleting the row and clearing the cookie, and does it again without complaint', async () => {
    const app = await buildAuthApp();
    const token = await signedIn(app);
    expect(app.store.sessions.size).toBe(1);
    for (let i = 0; i < 2; i++) {
      const res = await app.post(SIGN_OUT_PATH, undefined, token);
      expect(res.status).toBe(204);
      expect(maxAgeOf(res)).toBe(0);
      expect(app.store.sessions.size).toBe(0);
    }
    expect((await app.post(SIGN_OUT_PATH)).status).toBe(204);
    expect((await app.get(ME_PATH, token)).status).toBe(401);
  });
});

describe('limits', () => {
  it('throttles the auth routes at 10 a minute per client', async () => {
    const app = await buildAuthApp();
    for (let i = 0; i < 10; i++) {
      await signUp(app, `user${i}@example.test`);
    }
    const limited = await app.post(SIGN_UP_PATH, {
      email: 'one-more@example.test',
      password: PASSWORD,
    });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'rate_limited' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('locks an email out for a while after 5 failed sign-ins in 15 minutes', async () => {
    const app = await buildAuthApp();
    await signedIn(app);
    for (let i = 0; i < 5; i++) {
      app.advance(60_000);
      const res = await app.post(SIGN_IN_PATH, {
        email: EMAIL,
        password: 'wrong password',
      });
      expect(res.status).toBe(401);
    }
    const locked = await app.post(SIGN_IN_PATH, {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(locked.status).toBe(429);
    expect(locked.body).toEqual({ error: 'rate_limited' });
    expect(Number(locked.headers['retry-after'])).toBe(11 * 60);

    app.advance(11 * 60_000);
    const open = await app.post(SIGN_IN_PATH, {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(open.status).toBe(200);
  });

  it('locks unknown emails out the same way', async () => {
    const app = await buildAuthApp();
    const body = { email: 'nobody@example.test', password: PASSWORD };
    for (let i = 0; i < 5; i++) {
      expect((await app.post(SIGN_IN_PATH, body)).status).toBe(401);
    }
    expect((await app.post(SIGN_IN_PATH, body)).status).toBe(429);
  });

  it('sends at most 3 sign-up mails an hour per email, stores nothing past that and still answers 202', async () => {
    const app = await buildAuthApp();
    for (let i = 0; i < 4; i++) {
      const res = await signUp(app);
      expect(res.body).toEqual({ ok: true });
    }
    expect(app.mailer.sent).toHaveLength(3);
    expect(app.store.pendingSignups.size).toBe(3);
    app.advance(60 * 60_000);
    await signUp(app);
    expect(app.mailer.sent).toHaveLength(4);
  });

  it('counts the notice to a confirmed email against the same cap', async () => {
    const app = await buildAuthApp();
    await signedIn(app);
    for (let i = 0; i < 3; i++) await signUp(app);
    expect(app.mailer.sent).toHaveLength(3);
    app.advance(60 * 60_000);
    await signUp(app);
    expect(app.mailer.sent).toHaveLength(4);
  });
});

describe('cleanup', () => {
  it('deletes expired pending sign-ups and expired sessions only', async () => {
    const app = await buildAuthApp();
    await signUp(app, 'stale@example.test');
    await signedIn(app);
    app.advance(DAY_MS / 2);
    await signUp(app, 'fresh@example.test');

    app.advance(DAY_MS / 2);
    expect(await app.auth.cleanup()).toEqual({
      pendingSignups: 1,
      sessions: 0,
    });
    expect([...app.store.pendingSignups.values()].map((p) => p.email)).toEqual([
      'fresh@example.test',
    ]);
    expect(app.store.sessions.size).toBe(1);

    app.advance(30 * DAY_MS);
    expect(await app.auth.cleanup()).toEqual({
      pendingSignups: 1,
      sessions: 1,
    });
    expect([...app.store.users.values()].map((u) => u.email)).toEqual([EMAIL]);
  });
});
