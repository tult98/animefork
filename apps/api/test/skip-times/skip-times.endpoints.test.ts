import { randomInt, randomUUID } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { MAL_STORE, type MalStore } from '../../src/mal/mal.store.ts';
import { buildApp } from '../test-app.ts';
import { mockMalMatch } from './__mockData__/index.ts';

describe('skip times', () => {
  it('answers the intro and the outro of an episode in play order, without the recap', async () => {
    const { app, http } = await buildApp();
    const slug = `black-clover-${randomUUID()}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({ ...mockMalMatch, slug, malId });
    fetchMock.get(
      `https://api.aniskip.com/v2/skip-times/${malId}/3?types=op&types=ed&episodeLength=0`,
      {
        found: true,
        results: [
          { interval: { startTime: 1300, endTime: 1400 }, skipType: 'ed' },
          { interval: { startTime: 0, endTime: 5 }, skipType: 'recap' },
          { interval: { startTime: 10, endTime: 100 }, skipType: 'mixed-op' },
        ],
      },
    );

    const res = await http().get(`/v1/skip-times/${slug}/3`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      segments: [
        { kind: 'intro', startS: 10, endS: 100 },
        { kind: 'outro', startS: 1300, endS: 1400 },
      ],
    });
  });

  it('answers no segments and does not ask AniSkip for a title without a MyAnimeList match', async () => {
    const { http } = await buildApp();

    const res = await http().get(`/v1/skip-times/new-show-${randomUUID()}/1`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ segments: [] });
    expect(fetchMock).toHaveFetchedTimes(0);
  });

  it('rejects episode 0', async () => {
    const { http } = await buildApp();

    const res = await http().get('/v1/skip-times/black-clover/0');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
  });

  it('asks AniSkip once per episode and again after 24 hours', async () => {
    const { app, http, advance } = await buildApp();
    const slug = `black-clover-${randomUUID()}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({ ...mockMalMatch, slug, malId });
    fetchMock
      .get(
        `https://api.aniskip.com/v2/skip-times/${malId}/1?types=op&types=ed&episodeLength=0`,
        {
          found: true,
          results: [
            { interval: { startTime: 10, endTime: 100 }, skipType: 'op' },
          ],
        },
      )
      .get(
        `https://api.aniskip.com/v2/skip-times/${malId}/2?types=op&types=ed&episodeLength=0`,
        404,
      );
    await http().get(`/v1/skip-times/${slug}/1`);
    await http().get(`/v1/skip-times/${slug}/2`);
    advance(23 * 60 * 60_000);

    const cached = await http().get(`/v1/skip-times/${slug}/1`);
    const unknown = await http().get(`/v1/skip-times/${slug}/2`);

    expect(cached.body).toEqual({
      segments: [{ kind: 'intro', startS: 10, endS: 100 }],
    });
    expect(unknown.body).toEqual({ segments: [] });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      `https://api.aniskip.com/v2/skip-times/${malId}/1?types=op&types=ed&episodeLength=0`,
    );
    expect(fetchMock).toHaveFetchedTimes(
      1,
      `https://api.aniskip.com/v2/skip-times/${malId}/2?types=op&types=ed&episodeLength=0`,
    );
    advance(2 * 60 * 60_000);
    await http().get(`/v1/skip-times/${slug}/1`);
    expect(fetchMock).toHaveFetchedTimes(
      2,
      `https://api.aniskip.com/v2/skip-times/${malId}/1?types=op&types=ed&episodeLength=0`,
    );
  });

  it('answers no segments while AniSkip is down, and asks again after a minute', async () => {
    const { app, http, advance } = await buildApp();
    const slug = `black-clover-${randomUUID()}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({ ...mockMalMatch, slug, malId });
    fetchMock
      .get(
        `https://api.aniskip.com/v2/skip-times/${malId}/1?types=op&types=ed&episodeLength=0`,
        503,
        { repeat: 1 },
      )
      .get(
        `https://api.aniskip.com/v2/skip-times/${malId}/1?types=op&types=ed&episodeLength=0`,
        {
          found: true,
          results: [
            { interval: { startTime: 10, endTime: 100 }, skipType: 'op' },
          ],
        },
      );

    const down = await http().get(`/v1/skip-times/${slug}/1`);

    expect(down.status).toBe(200);
    expect(down.body).toEqual({ segments: [] });
    advance(59_000);
    const stillDown = await http().get(`/v1/skip-times/${slug}/1`);
    expect(stillDown.body).toEqual({ segments: [] });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      `https://api.aniskip.com/v2/skip-times/${malId}/1?types=op&types=ed&episodeLength=0`,
    );
    advance(2000);
    const back = await http().get(`/v1/skip-times/${slug}/1`);
    expect(back.body).toEqual({
      segments: [{ kind: 'intro', startS: 10, endS: 100 }],
    });
  });
});
