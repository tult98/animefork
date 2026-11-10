import { describe, expect, it } from 'vitest';
import {
  createApp,
  parseOrigins,
  type AppOptions,
} from '../src/art/art.controller.ts';
import { MAX_TITLES_PER_LOOKUP } from '../src/art/contract.ts';
import { setup, TONIKAWA } from './art/helpers.ts';

const ORIGIN = 'https://web.test';

function build(over: Partial<AppOptions> = {}) {
  const { store, filler, searches } = setup();
  const app = createApp({
    deps: { store, filler },
    allowedOrigins: [ORIGIN],
    remoteAddress: () => '10.0.0.1',
    ...over,
  });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/v1/art/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { app, post, filler, searches };
}

describe('art-api app', () => {
  it('answers the health check', async () => {
    const res = await build().app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('answers pending at once, then ready once the fill lands', async () => {
    const { post, filler, searches } = build();
    const first = await post({ titles: [TONIKAWA] });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      art: { [TONIKAWA.slug]: { status: 'pending' } },
    });
    await filler.idle();
    const later = await post({ titles: [TONIKAWA], episodes: true });
    expect(await later.json()).toEqual({
      art: {
        [TONIKAWA.slug]: {
          status: 'ready',
          backdropPath: '/en.jpg',
          backdropLang: 'en',
          stills: { '1': '/e1.jpg', '3': '/e3.jpg' },
        },
      },
    });
    expect(searches).toHaveLength(1);
  });

  it('answers 400 with issues for a bad body, a bad slug or too many titles', async () => {
    const { post } = build();
    const bodies = [
      '{not json',
      { titles: 'x' },
      { titles: [{ slug: 'Bad Slug', name: 'A' }] },
      {
        titles: Array.from({ length: MAX_TITLES_PER_LOOKUP + 1 }, (_, i) => ({
          slug: `s-${i}`,
          name: 'A',
        })),
      },
    ];
    for (const body of bodies) {
      const res = await post(body);
      expect(res.status).toBe(400);
    }
    const res = await post({ titles: [{ slug: 'Bad Slug', name: 'A' }] });
    expect(await res.json()).toEqual({
      error: 'invalid_request',
      issues: [{ path: 'titles.0.slug', message: expect.any(String) }],
    });
  });

  it('accepts exactly the title cap', async () => {
    const { post } = build({ ratePerMinute: 1000 });
    const res = await post({
      titles: Array.from({ length: MAX_TITLES_PER_LOOKUP }, (_, i) => ({
        slug: `s-${i}`,
        name: 'Nothing Here',
      })),
    });
    expect(res.status).toBe(200);
  });

  it('refuses a body over 64 KB', async () => {
    const { post } = build();
    const res = await post({
      titles: [{ slug: 'a', name: 'x'.repeat(70_000) }],
    });
    expect(res.status).toBe(413);
  });

  it('allows only the configured origins', async () => {
    const { post, app } = build();
    const allowed = await post({ titles: [TONIKAWA] }, { origin: ORIGIN });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const other = await post(
      { titles: [TONIKAWA] },
      { origin: 'https://evil.test' },
    );
    expect(other.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await app.request('/v1/art/lookup', {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(preflight.headers.get('access-control-allow-methods')).toContain(
      'POST',
    );
  });

  it('allows no origin when none is configured', async () => {
    const { post } = build({ allowedOrigins: parseOrigins(undefined) });
    const res = await post({ titles: [TONIKAWA] }, { origin: ORIGIN });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers 429 with Retry-After past the per-client rate and keeps CORS on it', async () => {
    let t = 0;
    const { post } = build({
      ratePerMinute: 2,
      now: () => new Date(t),
    });
    const ask = () => post({ titles: [TONIKAWA] }, { origin: ORIGIN });
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    const limited = await ask();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('30');
    expect(limited.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    t = 30_000;
    expect((await ask()).status).toBe(200);
  });

  it('keys the rate limit on the first X-Forwarded-For hop only when trusted', async () => {
    const ask = (post: ReturnType<typeof build>['post'], ip: string) =>
      post({ titles: [TONIKAWA] }, { 'x-forwarded-for': `${ip}, 10.9.9.9` });

    const trusted = build({ ratePerMinute: 1, trustProxy: true }).post;
    expect((await ask(trusted, '1.1.1.1')).status).toBe(200);
    expect((await ask(trusted, '2.2.2.2')).status).toBe(200);
    expect((await ask(trusted, '1.1.1.1')).status).toBe(429);

    const untrusted = build({ ratePerMinute: 1 }).post;
    expect((await ask(untrusted, '1.1.1.1')).status).toBe(200);
    expect((await ask(untrusted, '2.2.2.2')).status).toBe(429);
  });

  it('answers 503 when the store fails', async () => {
    const { store, filler } = setup();
    store.find = async () => {
      throw new Error('db down');
    };
    const app = createApp({ deps: { store, filler }, allowedOrigins: [] });
    const res = await app.request('/v1/art/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titles: [TONIKAWA] }),
    });
    expect(res.status).toBe(503);
  });
});
