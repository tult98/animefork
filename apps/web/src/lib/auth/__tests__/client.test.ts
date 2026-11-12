import { describe, expect, it } from 'vitest';
import { jsonResponse, stubAuth, user } from '../../../test/auth-stub.ts';
import { me, signIn, signOut, signUp, verifyEmail } from '../client.ts';

const credentials = { email: 'mai@example.com', password: 'correct horse' };

describe('signIn', () => {
  it('returns the user and sends the cookie with a JSON body', async () => {
    const stub = stubAuth({ signIn: () => jsonResponse(200, { user }) });
    expect(await signIn(credentials)).toEqual({ ok: true, data: user });
    const [call] = stub.to('signIn');
    expect(call?.init?.credentials).toBe('include');
    expect(call?.body).toEqual(credentials);
  });

  it.each([
    [401, { error: 'invalid_credentials' }, { kind: 'invalid_credentials' }],
    [400, { error: 'invalid_request' }, { kind: 'invalid_request' }],
    [500, { error: 'boom' }, { kind: 'network' }],
    [200, { nope: true }, { kind: 'network' }],
  ])('maps %i %j to %j', async (status, body, error) => {
    stubAuth({ signIn: () => jsonResponse(status, body) });
    expect(await signIn(credentials)).toEqual({ ok: false, error });
  });

  it('reads Retry-After on a 429', async () => {
    stubAuth({
      signIn: () =>
        jsonResponse(429, { error: 'rate_limited' }, { 'retry-after': '120' }),
    });
    expect(await signIn(credentials)).toEqual({
      ok: false,
      error: { kind: 'rate_limited', retryAfterSeconds: 120 },
    });
  });

  it('leaves the delay out when Retry-After is missing or not a number', async () => {
    stubAuth({
      signIn: () =>
        jsonResponse(429, { error: 'rate_limited' }, { 'retry-after': 'soon' }),
    });
    expect(await signIn(credentials)).toEqual({
      ok: false,
      error: { kind: 'rate_limited', retryAfterSeconds: undefined },
    });
  });

  it('reports a rejected fetch as a network error instead of throwing', async () => {
    stubAuth({
      signIn: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    expect(await signIn(credentials)).toEqual({
      ok: false,
      error: { kind: 'network' },
    });
  });

  it('is a network error without VITE_API_URL', async () => {
    expect(await signIn(credentials)).toEqual({
      ok: false,
      error: { kind: 'network' },
    });
  });
});

describe('signUp', () => {
  it('accepts a 202', async () => {
    stubAuth({ signUp: () => jsonResponse(202, { ok: true }) });
    expect(await signUp(credentials)).toEqual({ ok: true, data: null });
  });

  it('maps a 400 to invalid_request and a 429 to rate_limited', async () => {
    stubAuth({ signUp: () => jsonResponse(400, { error: 'invalid_request' }) });
    expect(await signUp(credentials)).toEqual({
      ok: false,
      error: { kind: 'invalid_request' },
    });
    stubAuth({ signUp: () => jsonResponse(429, { error: 'rate_limited' }) });
    expect(await signUp(credentials)).toMatchObject({
      ok: false,
      error: { kind: 'rate_limited' },
    });
  });
});

describe('signUp on a taken email', () => {
  it('maps a 409 to email_taken', async () => {
    stubAuth({ signUp: () => jsonResponse(409, { error: 'email_taken' }) });
    expect(await signUp(credentials)).toEqual({
      ok: false,
      error: { kind: 'email_taken' },
    });
  });
});

describe('verifyEmail', () => {
  it('posts the token and accepts a 200', async () => {
    const stub = stubAuth({
      verifyEmail: () => jsonResponse(200, { ok: true }),
    });
    expect(await verifyEmail('abc')).toEqual({ ok: true, data: null });
    expect(stub.to('verifyEmail')[0]?.body).toEqual({ token: 'abc' });
  });

  it('maps a 400 invalid_token', async () => {
    stubAuth({
      verifyEmail: () => jsonResponse(400, { error: 'invalid_token' }),
    });
    expect(await verifyEmail('abc')).toEqual({
      ok: false,
      error: { kind: 'invalid_token' },
    });
  });
});

describe('signOut', () => {
  it('accepts a 204', async () => {
    stubAuth({ signOut: () => new Response(null, { status: 204 }) });
    expect(await signOut()).toEqual({ ok: true, data: null });
  });

  it('reports a failure', async () => {
    stubAuth({ signOut: () => jsonResponse(500, {}) });
    expect(await signOut()).toEqual({ ok: false, error: { kind: 'network' } });
  });
});

describe('me', () => {
  it('returns the user on a 200', async () => {
    stubAuth({ me: () => jsonResponse(200, { user }) });
    expect(await me()).toEqual(user);
  });

  it('is null on a 401, a failure and an unset API', async () => {
    stubAuth({ me: () => jsonResponse(401, { error: 'unauthenticated' }) });
    expect(await me()).toBeNull();
    stubAuth({ me: () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(await me()).toBeNull();
  });

  it('is null without VITE_API_URL and makes no request', async () => {
    expect(await me()).toBeNull();
  });
});
