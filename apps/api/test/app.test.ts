import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { ART_SYNC, ArtFiller } from '../src/art/art.filler.ts';
import { ART_STORE, type ArtStore } from '../src/art/art.store.ts';
import {
  AVS_RATINGS_PATH,
  LOOKUP_PATH,
  MAX_TITLES_PER_LOOKUP,
} from '../src/art/contract.ts';
import {
  DeepSeekTranslator,
  OVERVIEW_TRANSLATOR,
} from '../src/art/translator.ts';
import { AUTH_CLEANUP_EVERY_MS } from '../src/auth/auth.service.ts';
import { ME_PATH } from '../src/auth/contract.ts';
import { AppModule } from '../src/app.module.ts';
import { configureApp } from '../src/app.setup.ts';
import { APP_CONFIG, ENV, type Env } from '../src/config/app.config.ts';
import { MigrationRunner, PG_POOL } from '../src/database/migration-runner.ts';
import { MAL_STORE, MemoryMalStore } from '../src/mal/mal.store.ts';
import {
  MemoryTitleNamesStore,
  TITLE_NAMES_STORE,
} from '../src/art/title-names.store.ts';
import { RATINGS_STORE } from '../src/ratings/ratings.store.ts';
import { setup, TONIKAWA } from './art/helpers.ts';
import { DETAIL_100_VI } from './art/tmdb/fixtures.ts';

const ORIGIN = 'https://web.test';

const BASE_ENV: Env = {
  DATABASE_URL: 'postgres://unused@localhost:1/unused',
  TMDB_API_KEY: 'key',
  ALLOWED_ORIGINS: ORIGIN,
};

const apps: NestExpressApplication[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function build(
  env: Env = {},
  over: { store?: (store: ArtStore) => ArtStore } = {},
) {
  const { store, ratings, sync, searches } = setup();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue({ ...BASE_ENV, ...env })
    .overrideProvider(PG_POOL)
    .useValue({ end: async () => undefined })
    .overrideProvider(MigrationRunner)
    .useValue({})
    .overrideProvider(ART_STORE)
    .useValue(over.store ? over.store(store) : store)
    .overrideProvider(RATINGS_STORE)
    .useValue(ratings)
    .overrideProvider(MAL_STORE)
    .useValue(new MemoryMalStore())
    .overrideProvider(TITLE_NAMES_STORE)
    .useValue(new MemoryTitleNamesStore())
    .overrideProvider(ART_SYNC)
    .useValue(sync)
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
  const post = (body: unknown, headers: Record<string, string> = {}) => {
    const req = http()
      .post(LOOKUP_PATH)
      .set({ 'content-type': 'application/json', ...headers });
    return req.send(typeof body === 'string' ? body : JSON.stringify(body));
  };
  return { app, http, post, filler: app.get(ArtFiller), searches, ratings };
}

describe('api app', () => {
  it('answers the health check', async () => {
    const res = await (await build()).http().get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('answers pending at once, then ready once the fill lands', async () => {
    const { post, filler, searches } = await build();
    const first = await post({ titles: [TONIKAWA] });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      art: { [TONIKAWA.slug]: { status: 'pending' } },
      ratings: {},
      avsStale: [TONIKAWA.slug],
    });
    await filler.idle();
    const later = await post({ titles: [TONIKAWA], episodes: true });
    expect(later.body).toEqual({
      art: {
        [TONIKAWA.slug]: {
          status: 'ready',
          backdropPath: '/en.jpg',
          backdropLang: 'en',
          posterPath: '/poster-vi.jpg',
          overview: DETAIL_100_VI.overview,
          overviewTranslated: false,
          stills: { '1': '/e1.jpg', '3': '/e3.jpg' },
        },
      },
      ratings: {},
      avsStale: [TONIKAWA.slug],
    });
    expect(searches).toHaveLength(1);
  });

  it('answers 400 for bad JSON, a bad body, a bad slug or too many titles', async () => {
    const { post } = await build({ RATE_LIMIT_PER_MINUTE: '1000' });
    const invalidJson = await post('{not json');
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.body).toEqual({ error: 'invalid_json' });
    const bodies = [
      { titles: 'x' },
      { titles: [{ slug: 'Bad Slug', name: 'A' }] },
      { titles: [{ slug: 'a-1', name: 'A', otherNames: 'Soul Land' }] },
      { titles: [{ slug: 'a-1', name: 'A', otherNames: [1] }] },
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
      expect(res.body).toMatchObject({ error: 'invalid_request' });
    }
    const res = await post({ titles: [{ slug: 'Bad Slug', name: 'A' }] });
    expect(res.body).toEqual({
      error: 'invalid_request',
      issues: [{ path: 'titles.0.slug', message: expect.any(String) }],
    });
  });

  it('stores a submitted AVS rating and answers it on the next lookup', async () => {
    const { http, post } = await build();
    const submit = await http()
      .post(AVS_RATINGS_PATH)
      .set('content-type', 'application/json')
      .send({
        items: [
          { slug: TONIKAWA.slug, score: 8.2, voters: 1284, quality: 'HD' },
        ],
      });
    expect(submit.status).toBe(204);
    const res = await post({ titles: [TONIKAWA] });
    expect(res.body.avsStale).toEqual([]);
    expect(res.body.ratings).toEqual({
      [TONIKAWA.slug]: { avs: { score: 8.2, voters: 1284 }, quality: 'HD' },
    });
  });

  it('answers 400 for a bad AVS submission', async () => {
    const { http } = await build();
    const res = await http()
      .post(AVS_RATINGS_PATH)
      .set('content-type', 'application/json')
      .send({ items: [{ slug: 'a-1', score: 11, voters: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
  });

  it('accepts exactly the title cap', async () => {
    const { post } = await build();
    const res = await post({
      titles: Array.from({ length: MAX_TITLES_PER_LOOKUP }, (_, i) => ({
        slug: `s-${i}`,
        name: 'Nothing Here',
      })),
    });
    expect(res.status).toBe(200);
  });

  it('refuses a body over 64 KB', async () => {
    const { post } = await build();
    const res = await post({
      titles: [{ slug: 'a', name: 'x'.repeat(70_000) }],
    });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'body_too_large' });
  });

  it('allows only the configured origins', async () => {
    const { post, http } = await build();
    const allowed = await post({ titles: [TONIKAWA] }, { origin: ORIGIN });
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
    const other = await post(
      { titles: [TONIKAWA] },
      { origin: 'https://evil.test' },
    );
    expect(other.headers['access-control-allow-origin']).toBeUndefined();

    const preflight = await http().options(LOOKUP_PATH).set({
      origin: ORIGIN,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(preflight.headers['access-control-allow-methods']).toBe(
      'GET,POST,PUT',
    );
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows credentials from the configured origins only, so the session cookie rides along', async () => {
    const { http } = await build();
    const allowed = await http().get(ME_PATH).set({ origin: ORIGIN });
    expect(allowed.status).toBe(401);
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const other = await http()
      .get(ME_PATH)
      .set({ origin: 'https://evil.test' });
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows no origin when none is configured', async () => {
    const { post } = await build({ ALLOWED_ORIGINS: undefined });
    const res = await post({ titles: [TONIKAWA] }, { origin: ORIGIN });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers 429 with Retry-After past the per-client rate and keeps CORS on it', async () => {
    const { post, http } = await build({ RATE_LIMIT_PER_MINUTE: '2' });
    const ask = () => post({ titles: [TONIKAWA] }, { origin: ORIGIN });
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    const limited = await ask();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'rate_limited' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(limited.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect((await http().get('/healthz')).status).toBe(200);
  });

  it('keys the rate limit on the first X-Forwarded-For hop only when trusted', async () => {
    const ask = (post: Awaited<ReturnType<typeof build>>['post'], ip: string) =>
      post({ titles: [TONIKAWA] }, { 'x-forwarded-for': `${ip}, 10.9.9.9` });

    const trusted = (
      await build({ RATE_LIMIT_PER_MINUTE: '1', TRUST_PROXY: '1' })
    ).post;
    expect((await ask(trusted, '1.1.1.1')).status).toBe(200);
    expect((await ask(trusted, '2.2.2.2')).status).toBe(200);
    expect((await ask(trusted, '1.1.1.1')).status).toBe(429);

    const untrusted = (await build({ RATE_LIMIT_PER_MINUTE: '1' })).post;
    expect((await ask(untrusted, '1.1.1.1')).status).toBe(200);
    expect((await ask(untrusted, '2.2.2.2')).status).toBe(429);
  });

  it('answers 503 when the store fails', async () => {
    const { post } = await build(
      {},
      {
        store: (store) => {
          store.find = async () => {
            throw new Error('db down');
          };
          return store;
        },
      },
    );
    const res = await post({ titles: [TONIKAWA] });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'unavailable' });
  });

  it('wires the DeepSeek translator only when its key is set', async () => {
    const off = await build();
    expect(off.app.get(OVERVIEW_TRANSLATOR)).toBeNull();
    const on = await build({
      DEEPSEEK_API_KEY: 'ds',
      DEEPSEEK_API_BASE: 'http://127.0.0.1:9',
    });
    expect(on.app.get(OVERVIEW_TRANSLATOR)).toBeInstanceOf(DeepSeekTranslator);
  });

  it('refuses to boot without the TMDB key the art module needs', async () => {
    await expect(build({ TMDB_API_KEY: undefined })).rejects.toThrow(
      /missing or invalid env: TMDB_API_KEY/,
    );
  });
});
