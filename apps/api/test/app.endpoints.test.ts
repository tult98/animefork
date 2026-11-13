import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/database/migration-runner.ts';
import { buildApp } from './test-app.ts';

describe('api app', () => {
  it('answers the health check', async () => {
    const { http } = await buildApp();

    const res = await http().get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('lets the configured origin send credentials, and no other origin', async () => {
    const { http } = await buildApp({
      env: { ALLOWED_ORIGINS: 'https://web.test' },
    });

    const allowed = await http()
      .get('/healthz')
      .set('Origin', 'https://web.test');
    const other = await http()
      .get('/healthz')
      .set('Origin', 'https://evil.test');
    const preflight = await http().options('/v1/ratings/avs').set({
      Origin: 'https://web.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    });

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://web.test',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'https://web.test',
    );
    expect(preflight.headers['access-control-allow-methods']).toBe(
      'GET,POST,PUT',
    );
  });

  it('refuses a body over 64 KB', async () => {
    const { http } = await buildApp();

    const res = await http()
      .post('/v1/ratings/avs')
      .send({
        items: [
          { slug: 'a', score: 8, voters: 1, quality: 'x'.repeat(70_000) },
        ],
      });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'body_too_large' });
  });

  it('answers 400 for a body that is not JSON', async () => {
    const { http } = await buildApp();

    const res = await http()
      .post('/v1/ratings/avs')
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_json' });
  });

  it('answers 429 with Retry-After once a client passes the rate limit, and never limits the health check', async () => {
    const { http } = await buildApp({ env: { RATE_LIMIT_PER_MINUTE: '2' } });
    const rating = {
      items: [{ slug: `black-clover-${randomUUID()}`, score: 8, voters: 1 }],
    };
    await http().post('/v1/ratings/avs').send(rating);
    await http().post('/v1/ratings/avs').send(rating);

    const limited = await http().post('/v1/ratings/avs').send(rating);

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'rate_limited' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    const health = await http().get('/healthz');
    expect(health.status).toBe(200);
  });

  it('counts the rate limit for each X-Forwarded-For client when the proxy is trusted', async () => {
    const { http } = await buildApp({
      env: { RATE_LIMIT_PER_MINUTE: '1', TRUST_PROXY: '1' },
    });
    const rating = {
      items: [{ slug: `black-clover-${randomUUID()}`, score: 8, voters: 1 }],
    };

    const first = await http()
      .post('/v1/ratings/avs')
      .set('X-Forwarded-For', '1.1.1.1, 10.9.9.9')
      .send(rating);
    const otherClient = await http()
      .post('/v1/ratings/avs')
      .set('X-Forwarded-For', '2.2.2.2, 10.9.9.9')
      .send(rating);
    const firstAgain = await http()
      .post('/v1/ratings/avs')
      .set('X-Forwarded-For', '1.1.1.1, 10.9.9.9')
      .send(rating);

    expect(first.status).toBe(204);
    expect(otherClient.status).toBe(204);
    expect(firstAgain.status).toBe(429);
  });

  it('answers 503 when the database cannot be reached', async () => {
    const { http, app } = await buildApp();
    await app.get<pg.Pool>(PG_POOL).end();

    const res = await http()
      .post('/v1/ratings/avs')
      .send({
        items: [{ slug: `black-clover-${randomUUID()}`, score: 8, voters: 1 }],
      });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'unavailable' });
  });
});
