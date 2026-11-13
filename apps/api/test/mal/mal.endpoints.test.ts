import { randomInt } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { ART_STORE, type ArtStore } from '../../src/art/art.store.ts';
import type { MalFiller } from '../../src/mal/mal.filler.ts';
import { MAL_FILLER } from '../../src/mal/mal.module.ts';
import { MAL_STORE, type MalStore } from '../../src/mal/mal.store.ts';
import { buildApp } from '../test-app.ts';

// Each test stores an art miss for its title first, so the lookup has no TMDB work to do and only MAL is asked.
describe('art lookup with MyAnimeList', () => {
  it('answers that ratings are pending at once, then the MAL numbers once the title is matched', async () => {
    const { app, http } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await app
      .get<ArtStore>(ART_STORE)
      .saveMiss({ slug, name: 'Black Clover' }, 'no_match', 'no art');
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Black+Clover&', {
        data: [
          {
            node: {
              id: malId,
              title: 'Black Clover',
              start_season: { year: 2017, season: 'fall' },
              start_date: '2017-10-03',
              num_episodes: 170,
              media_type: 'tv',
              mean: 7.55,
              num_scoring_users: 69596,
              rank: 2006,
              popularity: 1762,
              num_list_users: 157000,
              status: 'finished_airing',
            },
          },
        ],
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, {
        data: { trailer: { youtube_id: 'abc123' } },
      })
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);

    const first = await http()
      .post('/v1/art/lookup')
      .send({
        titles: [{ slug, name: 'Black Clover', year: 2017, episodeCount: 170 }],
      });
    await app.get<MalFiller>(MAL_FILLER).idle();
    const later = await http()
      .post('/v1/art/lookup')
      .send({
        titles: [{ slug, name: 'Black Clover', year: 2017, episodeCount: 170 }],
      });

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      art: { [slug]: { status: 'none' } },
      ratings: {},
      avsStale: [slug],
      ratingsPending: true,
    });
    expect(later.body).toEqual({
      art: { [slug]: { status: 'none' } },
      ratings: {
        [slug]: {
          mal: {
            id: malId,
            score: 7.55,
            voters: 69596,
            rank: 2006,
            popularity: 1762,
            members: 157000,
            airing: 'finished_airing',
            episodes: 170,
            startDate: '2017-10-03',
            startSeason: { year: 2017, season: 'fall' },
            trailerYoutubeId: 'abc123',
          },
        },
      },
      avsStale: [slug],
    });
    expect(fetchMock).toHaveFetchedTimes(1, 'begin:https://mal.test/v2/anime');
  });

  it('serves a week-old MAL row at once without reporting pending, and refreshes it for the next lookup', async () => {
    const { app, http } = await buildApp({
      now: new Date('2026-03-01T00:00:00Z'),
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await app
      .get<ArtStore>(ART_STORE)
      .saveMiss({ slug, name: 'Black Clover' }, 'no_match', 'no art');
    await app.get<MalStore>(MAL_STORE).save({
      slug,
      status: 'ok',
      malId,
      score: 7.55,
      voters: 69596,
      rank: 2006,
      popularity: 1762,
      members: 157000,
      airing: 'finished_airing',
      episodes: 170,
      startDate: '2017-10-03',
      startSeason: { year: 2017, season: 'fall' },
      trailerYoutubeId: null,
      datesKnown: true,
      matchedTitle: 'Black Clover',
      matchScore: 1,
      matchedBy: 'score',
      matcherVersion: 3,
      reason: null,
      attemptedAt: new Date('2026-02-22T00:00:00Z'),
      fetchedAt: new Date('2026-02-22T00:00:00Z'),
    });
    fetchMock
      .get(`begin:https://mal.test/v2/anime/${malId}?fields=`, {
        id: malId,
        title: 'Black Clover',
        mean: 8.01,
        status: 'finished_airing',
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, 503)
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);

    const stale = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Black Clover' }] });
    await app.get<MalFiller>(MAL_FILLER).idle();
    const fresh = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Black Clover' }] });

    expect(stale.body.ratings[slug].mal.score).toBe(7.55);
    expect(stale.body).not.toHaveProperty('ratingsPending');
    expect(fresh.body.ratings[slug].mal.score).toBe(8.01);
  });

  it('gives a title MAL has no match for no MAL numbers and stops reporting pending', async () => {
    const { app, http } = await buildApp({
      env: { MAL_CLIENT_ID: 'abc', MAL_API_BASE: 'https://mal.test/v2' },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    await app
      .get<ArtStore>(ART_STORE)
      .saveMiss({ slug, name: 'Black Clover' }, 'no_match', 'no art');
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Black+Clover&', { data: [] })
      .get('begin:https://mal.test/v2/anime?q=black+clover&', { data: [] });

    await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Black Clover' }] });
    await app.get<MalFiller>(MAL_FILLER).idle();
    const later = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Black Clover' }] });

    expect(later.body).toEqual({
      art: { [slug]: { status: 'none' } },
      ratings: {},
      avsStale: [slug],
    });
  });

  it('never calls MAL and never reports pending when MAL_CLIENT_ID is not set', async () => {
    const { app, http } = await buildApp();
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    await app
      .get<ArtStore>(ART_STORE)
      .saveMiss({ slug, name: 'Black Clover' }, 'no_match', 'no art');

    const res = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Black Clover' }] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      art: { [slug]: { status: 'none' } },
      ratings: {},
      avsStale: [slug],
    });
    expect(fetchMock).toHaveFetchedTimes(0);
  });
});
