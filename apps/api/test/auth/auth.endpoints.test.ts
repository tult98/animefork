import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../src/auth/auth.service.ts';
import { buildApp } from '../test-app.ts';

describe('accounts', () => {
  it('creates the account once the mailed link is confirmed, then signs in with a session cookie', async () => {
    const { http, mailer } = await buildApp();
    const id = randomUUID();
    const email = `ana-${id}@example.test`;

    const signUp = await http()
      .post('/v1/auth/sign-up')
      .send({ email: `  Ana-${id}@Example.TEST `, password: 'correct horse' });

    expect(signUp.status).toBe(202);
    expect(signUp.body).toEqual({ ok: true });
    expect(signUp.get('Set-Cookie')).toBeUndefined();
    expect(mailer.sent).toEqual([
      {
        to: email,
        subject: 'Xác nhận email của bạn trên Animefork',
        text: expect.stringContaining('https://web.test/verify-email#token='),
      },
    ]);
    const early = await http()
      .post('/v1/auth/sign-in')
      .send({ email, password: 'correct horse' });
    expect(early.status).toBe(401);
    expect(early.body).toEqual({ error: 'invalid_credentials' });
    expect(early.get('Set-Cookie')).toBeUndefined();

    const verified = await http()
      .post('/v1/auth/verify-email')
      .send({
        token: mailer.sent[0]?.text.split('#token=')[1]?.split('\n')[0],
      });

    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ ok: true });
    expect(verified.get('Set-Cookie')).toBeUndefined();

    const signIn = await http()
      .post('/v1/auth/sign-in')
      .send({ email, password: 'correct horse' });

    expect(signIn.status).toBe(200);
    expect(signIn.body).toEqual({ user: { id: expect.any(String), email } });
    expect(signIn.get('Set-Cookie')).toEqual([
      expect.stringMatching(
        /^session=[\w-]{43}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax; Secure$/,
      ),
    ]);
    const me = await http()
      .get('/v1/auth/me')
      .set('Cookie', signIn.get('Set-Cookie')?.[0]?.split(';')[0] ?? '');
    expect(me.status).toBe(200);
    expect(me.body).toEqual(signIn.body);
  });

  it('keeps the owner’s password when someone else signs up the same email after them', async () => {
    const { http, mailer } = await buildApp();
    const email = `ana-${randomUUID()}@example.test`;
    await http()
      .post('/v1/auth/sign-up')
      .send({ email, password: 'owner password' });
    await http()
      .post('/v1/auth/sign-up')
      .send({ email, password: 'attacker password' });
    const [ownerLink, attackerLink] = mailer.sent.map(
      (mail) => mail.text.split('#token=')[1]?.split('\n')[0],
    );

    const owner = await http()
      .post('/v1/auth/verify-email')
      .send({ token: ownerLink });
    const attacker = await http()
      .post('/v1/auth/verify-email')
      .send({ token: attackerLink });

    expect(owner.status).toBe(200);
    expect(attacker.status).toBe(400);
    expect(attacker.body).toEqual({ error: 'invalid_token' });
    const withAttackerPassword = await http()
      .post('/v1/auth/sign-in')
      .send({ email, password: 'attacker password' });
    expect(withAttackerPassword.status).toBe(401);
    expect(withAttackerPassword.body).toEqual({ error: 'invalid_credentials' });
    const withOwnerPassword = await http()
      .post('/v1/auth/sign-in')
      .send({ email, password: 'owner password' });
    expect(withOwnerPassword.status).toBe(200);
  });

  it('creates one account when two links for an email are confirmed at the same time', async () => {
    const { http, mailer } = await buildApp();
    const email = `ana-${randomUUID()}@example.test`;
    await http()
      .post('/v1/auth/sign-up')
      .send({ email, password: 'first password' });
    await http()
      .post('/v1/auth/sign-up')
      .send({ email, password: 'second password' });
    const [first, second] = mailer.sent.map(
      (mail) => mail.text.split('#token=')[1]?.split('\n')[0],
    );

    const answers = await Promise.all([
      http().post('/v1/auth/verify-email').send({ token: first }),
      http().post('/v1/auth/verify-email').send({ token: second }),
    ]);

    expect(answers.map((res) => res.status).sort()).toEqual([200, 400]);
    const signIns = await Promise.all([
      http()
        .post('/v1/auth/sign-in')
        .send({ email, password: 'first password' }),
      http()
        .post('/v1/auth/sign-in')
        .send({ email, password: 'second password' }),
    ]);
    expect(signIns.map((res) => res.status).sort()).toEqual([200, 401]);
  });

  it('refuses a link that expired after 24 hours, was already used, or was never mailed', async () => {
    const { http, mailer, advance } = await buildApp();
    const email = `ana-${randomUUID()}@example.test`;
    await http()
      .post('/v1/auth/sign-up')
      .send({ email, password: 'correct horse' });
    advance(24 * 60 * 60_000);
    await http()
      .post('/v1/auth/sign-up')
      .send({ email, password: 'correct horse' });
    const [expiredLink, usedLink] = mailer.sent.map(
      (mail) => mail.text.split('#token=')[1]?.split('\n')[0],
    );
    await http().post('/v1/auth/verify-email').send({ token: usedLink });

    const expired = await http()
      .post('/v1/auth/verify-email')
      .send({ token: expiredLink });
    const used = await http()
      .post('/v1/auth/verify-email')
      .send({ token: usedLink });
    const unknown = await http()
      .post('/v1/auth/verify-email')
      .send({ token: 'never-mailed' });

    for (const res of [expired, used, unknown]) {
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_token' });
    }
  });

  it('keeps the 5 newest links of an email, so the oldest stops working', async () => {
    const { http, mailer, advance } = await buildApp();
    const email = `ana-${randomUUID()}@example.test`;
    for (let i = 0; i < 6; i++) {
      await http()
        .post('/v1/auth/sign-up')
        .send({ email, password: `password ${i}` });
      advance(60 * 60_000);
    }
    const links = mailer.sent.map(
      (mail) => mail.text.split('#token=')[1]?.split('\n')[0],
    );

    const oldest = await http()
      .post('/v1/auth/verify-email')
      .send({ token: links[0] });
    const secondOldest = await http()
      .post('/v1/auth/verify-email')
      .send({ token: links[1] });

    expect(links).toHaveLength(6);
    expect(oldest.status).toBe(400);
    expect(oldest.body).toEqual({ error: 'invalid_token' });
    expect(secondOldest.status).toBe(200);
  });

  it('answers 409 to a sign-up for an email that already has an account, and mails nothing', async () => {
    const { http, mailer, signedIn } = await buildApp();
    const email = `ana-${randomUUID()}@example.test`;
    await signedIn(email);

    const res = await http()
      .post('/v1/auth/sign-up')
      .send({ email: email.toUpperCase(), password: 'another password' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'email_taken' });
    expect(mailer.sent).toEqual([]);
  });

  it('rejects a sign-up with a password under 8 characters', async () => {
    const { http, mailer } = await buildApp();

    const res = await http()
      .post('/v1/auth/sign-up')
      .send({ email: `ana-${randomUUID()}@example.test`, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
    expect(mailer.sent).toEqual([]);
  });

  it('answers 503 to a sign-up when the server has no web address to build the link from', async () => {
    const { http, mailer } = await buildApp({
      env: { ALLOWED_ORIGINS: undefined },
    });

    const res = await http()
      .post('/v1/auth/sign-up')
      .send({
        email: `ana-${randomUUID()}@example.test`,
        password: 'correct horse',
      });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'unavailable' });
    expect(mailer.sent).toEqual([]);
  });

  it('mails an email at most 3 links an hour and still answers 202 past that', async () => {
    const { http, mailer } = await buildApp();
    const email = `ana-${randomUUID()}@example.test`;
    for (let i = 0; i < 3; i++) {
      await http()
        .post('/v1/auth/sign-up')
        .send({ email, password: 'correct horse' });
    }

    const fourth = await http()
      .post('/v1/auth/sign-up')
      .send({ email, password: 'correct horse' });

    expect(fourth.status).toBe(202);
    expect(fourth.body).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(3);
  });

  it('locks an email out after 5 wrong passwords in 15 minutes, even for the right password', async () => {
    const { http, mailer, advance } = await buildApp();
    const email = `ana-${randomUUID()}@example.test`;
    await http()
      .post('/v1/auth/sign-up')
      .send({ email, password: 'correct horse' });
    await http()
      .post('/v1/auth/verify-email')
      .send({
        token: mailer.sent[0]?.text.split('#token=')[1]?.split('\n')[0],
      });
    for (let i = 0; i < 5; i++) {
      const wrong = await http()
        .post('/v1/auth/sign-in')
        .send({ email, password: 'wrong password' });
      expect(wrong.status).toBe(401);
      expect(wrong.body).toEqual({ error: 'invalid_credentials' });
      expect(wrong.get('Set-Cookie')).toBeUndefined();
      advance(60_000);
    }

    const locked = await http()
      .post('/v1/auth/sign-in')
      .send({ email, password: 'correct horse' });

    expect(locked.status).toBe(429);
    expect(locked.body).toEqual({ error: 'rate_limited' });
    expect(locked.get('Retry-After')).toBe('600');
    expect(locked.get('Set-Cookie')).toBeUndefined();
    advance(10 * 60_000);
    const open = await http()
      .post('/v1/auth/sign-in')
      .send({ email, password: 'correct horse' });
    expect(open.status).toBe(200);
  });

  it('answers 429 to the 11th auth request a client sends in a minute', async () => {
    const { http } = await buildApp();
    for (let i = 0; i < 10; i++) {
      await http().post('/v1/auth/verify-email').send({ token: 'guess' });
    }

    const res = await http()
      .post('/v1/auth/verify-email')
      .send({ token: 'guess' });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
    expect(Number(res.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('answers 401 without a session and clears the cookie', async () => {
    const { http } = await buildApp();

    const res = await http()
      .get('/v1/auth/me')
      .set('Cookie', 'session=not-a-session');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthenticated' });
    expect(res.get('Set-Cookie')).toEqual([
      'session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure',
    ]);
  });

  it('extends the session for 30 days when it is used more than a day after the last time', async () => {
    const { http, signedIn, advance } = await buildApp();
    const email = `ana-${randomUUID()}@example.test`;
    const cookie = await signedIn(email);
    advance(24 * 60 * 60_000);
    const withinADay = await http().get('/v1/auth/me').set('Cookie', cookie);
    advance(1);

    const res = await http().get('/v1/auth/me').set('Cookie', cookie);

    expect(withinADay.status).toBe(200);
    expect(withinADay.get('Set-Cookie')).toBeUndefined();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: expect.any(String), email } });
    expect(res.get('Set-Cookie')).toEqual([
      `${cookie}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax; Secure`,
    ]);
  });

  it('follows SESSION_TTL_DAYS and drops Secure from the cookie when COOKIE_SECURE is 0', async () => {
    const { http, signedIn, advance } = await buildApp({
      env: { SESSION_TTL_DAYS: '7', COOKIE_SECURE: '0' },
    });
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);
    advance(25 * 60 * 60_000);

    const res = await http().get('/v1/auth/me').set('Cookie', cookie);

    expect(res.get('Set-Cookie')).toEqual([
      `${cookie}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`,
    ]);
  });

  it('ends a session that was not used for 30 days', async () => {
    const { http, signedIn, advance } = await buildApp();
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);
    advance(30 * 24 * 60 * 60_000);

    const res = await http().get('/v1/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthenticated' });
    expect(res.get('Set-Cookie')).toEqual([
      'session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure',
    ]);
  });

  it('ends a session 90 days after it was opened, however often it is used', async () => {
    const { http, signedIn, advance } = await buildApp();
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);
    advance(29 * 24 * 60 * 60_000);
    await http().get('/v1/auth/me').set('Cookie', cookie);
    advance(29 * 24 * 60 * 60_000);
    await http().get('/v1/auth/me').set('Cookie', cookie);
    advance(29 * 24 * 60 * 60_000);

    const day87 = await http().get('/v1/auth/me').set('Cookie', cookie);
    advance(3 * 24 * 60 * 60_000);
    const day90 = await http().get('/v1/auth/me').set('Cookie', cookie);

    expect(day87.status).toBe(200);
    expect(day87.get('Set-Cookie')).toEqual([
      `${cookie}; Max-Age=259200; Path=/; HttpOnly; SameSite=Lax; Secure`,
    ]);
    expect(day90.status).toBe(401);
    expect(day90.body).toEqual({ error: 'unauthenticated' });
  });

  it('signs out by ending the session and clearing the cookie, and answers 204 again afterwards', async () => {
    const { http, signedIn } = await buildApp();
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);

    const res = await http().post('/v1/auth/sign-out').set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(res.get('Set-Cookie')).toEqual([
      'session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure',
    ]);
    const me = await http().get('/v1/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
    const again = await http().post('/v1/auth/sign-out').set('Cookie', cookie);
    expect(again.status).toBe(204);
  });

  it('cleans up expired links and sessions and leaves the live ones working', async () => {
    // The cleanup deletes every expired row in the database. In 2020 nothing of another test, which all run in 2026, has expired.
    const { app, http, mailer, signedIn, advance } = await buildApp({
      now: new Date('2020-01-01T00:00:00Z'),
    });
    const id = randomUUID();
    await signedIn(`stale-${id}@example.test`);
    await http()
      .post('/v1/auth/sign-up')
      .send({
        email: `stale-link-${id}@example.test`,
        password: 'correct horse',
      });
    advance(30 * 24 * 60 * 60_000);
    const live = await signedIn(`live-${id}@example.test`);
    await http()
      .post('/v1/auth/sign-up')
      .send({
        email: `live-link-${id}@example.test`,
        password: 'correct horse',
      });

    const deleted = await app.get(AuthService).cleanup();

    expect(deleted).toEqual({ pendingSignups: 1, sessions: 1 });
    const me = await http().get('/v1/auth/me').set('Cookie', live);
    expect(me.status).toBe(200);
    const verified = await http()
      .post('/v1/auth/verify-email')
      .send({
        token: mailer.sent[1]?.text.split('#token=')[1]?.split('\n')[0],
      });
    expect(verified.status).toBe(200);
  });
});
