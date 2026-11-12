import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { CLOCK } from '../../src/common/clock.ts';
import {
  MAL_STORE,
  MemoryMalStore,
  type StoredMal,
} from '../../src/mal/mal.store.ts';
import {
  createAniskipClient,
  type AniskipClient,
} from '../../src/skip-times/aniskip.client.ts';
import {
  SkipTimesResponseSchema,
  skipTimesPath,
} from '../../src/skip-times/contract.ts';
import { SkipTimesController } from '../../src/skip-times/skip-times.controller.ts';
import {
  ANISKIP_CLIENT,
  ANSWER_TTL_MS,
  FAILURE_TTL_MS,
  SkipTimesService,
} from '../../src/skip-times/skip-times.service.ts';

const START = new Date('2026-03-01T00:00:00Z');
const OP = { interval: { startTime: 10, endTime: 100 }, skipType: 'op' };
const ED = { interval: { startTime: 1300, endTime: 1400 }, skipType: 'ed' };
const RECAP = { interval: { startTime: 0, endTime: 5 }, skipType: 'recap' };

const apps: NestExpressApplication[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function malRow(over: Partial<StoredMal>): StoredMal {
  return {
    slug: 'show-a1',
    status: 'matched',
    malId: 21,
    score: null,
    voters: null,
    rank: null,
    popularity: null,
    members: null,
    airing: null,
    episodes: null,
    startDate: null,
    startSeason: null,
    datesKnown: true,
    matchedTitle: null,
    matchScore: null,
    matchedBy: null,
    matcherVersion: 1,
    reason: null,
    attemptedAt: START,
    fetchedAt: START,
    ...over,
  } as StoredMal;
}

async function build(
  respond: (url: URL) => Response | Promise<Response>,
  rows: StoredMal[] = [malRow({})],
) {
  let now = START.getTime();
  const calls: URL[] = [];
  const mal = new MemoryMalStore();
  for (const row of rows) await mal.save(row);
  const aniskip: AniskipClient = createAniskipClient({
    fetch: async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      return respond(url);
    },
  });
  const moduleRef = await Test.createTestingModule({
    controllers: [SkipTimesController],
    providers: [
      SkipTimesService,
      { provide: MAL_STORE, useValue: mal },
      { provide: ANISKIP_CLIENT, useValue: aniskip },
      { provide: CLOCK, useValue: () => new Date(now) },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  await app.init();
  apps.push(app);
  const getPath = (path: string) => request(app.getHttpServer()).get(path);
  return {
    getPath,
    get: (slug: string, episode: number) =>
      getPath(skipTimesPath(slug, episode)),
    calls,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const ok = (...results: unknown[]) =>
  new Response(JSON.stringify({ found: true, results }), { status: 200 });

describe('skip times endpoint', () => {
  it('answers intro and outro segments for a slug with a MAL id', async () => {
    const { get, calls } = await build(() => ok(ED, OP));
    const res = await get('show-a1', 3);
    expect(res.status).toBe(200);
    expect(SkipTimesResponseSchema.parse(res.body).segments).toEqual([
      { kind: 'intro', startS: 10, endS: 100 },
      { kind: 'outro', startS: 1300, endS: 1400 },
    ]);
    expect(calls[0]?.pathname).toBe('/v2/skip-times/21/3');
  });

  it('drops a recap', async () => {
    const { get } = await build(() => ok(RECAP));
    expect((await get('show-a1', 1)).body).toEqual({ segments: [] });
  });

  it('answers no segments on a 404 from AniSkip', async () => {
    const { get } = await build(
      () => new Response('{"found":false,"results":[]}', { status: 404 }),
    );
    const res = await get('show-a1', 1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ segments: [] });
  });

  it('answers no segments and never calls AniSkip without a MAL id', async () => {
    const { get, calls } = await build(
      () => ok(OP),
      [malRow({ slug: 'show-a1', malId: null })],
    );
    expect((await get('show-a1', 1)).body).toEqual({ segments: [] });
    expect((await get('unknown-a2', 1)).body).toEqual({ segments: [] });
    expect(calls).toEqual([]);
  });

  it('answers 200 with no segments when AniSkip answers an error', async () => {
    const { get } = await build(() => new Response('boom', { status: 503 }));
    const res = await get('show-a1', 1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ segments: [] });
  });

  it('answers 200 with no segments when AniSkip cannot be reached', async () => {
    const { get } = await build(() => {
      throw new TypeError('offline');
    });
    const res = await get('show-a1', 1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ segments: [] });
  });

  it('serves a repeat from the cache until the answer expires', async () => {
    const { get, calls, advance } = await build(() => ok(OP));
    await get('show-a1', 1);
    await get('show-a1', 1);
    expect(calls).toHaveLength(1);
    await get('show-a1', 2);
    expect(calls).toHaveLength(2);
    advance(ANSWER_TTL_MS + 1);
    await get('show-a1', 1);
    expect(calls).toHaveLength(3);
  });

  it('remembers a failure only briefly', async () => {
    let healthy = false;
    const { get, calls, advance } = await build(() =>
      healthy ? ok(OP) : new Response('boom', { status: 500 }),
    );
    await get('show-a1', 1);
    await get('show-a1', 1);
    expect(calls).toHaveLength(1);
    healthy = true;
    advance(FAILURE_TTL_MS + 1);
    const res = await get('show-a1', 1);
    expect(calls).toHaveLength(2);
    expect(res.body).toEqual({
      segments: [{ kind: 'intro', startS: 10, endS: 100 }],
    });
  });

  it('rejects an episode that is not a positive integer', async () => {
    const { getPath, calls } = await build(() => ok(OP));
    for (const episode of ['0', '-1', '1.5', 'abc', '10000']) {
      const res = await getPath(`/v1/skip-times/show-a1/${episode}`);
      expect(res.status, episode).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});
