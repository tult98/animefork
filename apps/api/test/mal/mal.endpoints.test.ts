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

  it('leaves a movie unmatched rather than give it the MAL entry its series already holds under the same name', async () => {
    const { app, http } = await buildApp({
      env: { MAL_CLIENT_ID: 'abc', MAL_API_BASE: 'https://mal.test/v2' },
    });
    const run = randomInt(1_000_000_000);
    const series = `one-piece-a${run}`;
    const movie = `one-piece-movie-a${run}`;
    const seriesMalId = randomInt(1, 2_000_000_000);
    const art = app.get<ArtStore>(ART_STORE);
    await art.saveMiss(
      { slug: series, name: 'One Piece' },
      'no_match',
      'no art',
    );
    await art.saveMiss(
      { slug: movie, name: 'One Piece' },
      'no_match',
      'no art',
    );
    await app.get<MalStore>(MAL_STORE).save({
      slug: series,
      status: 'ok',
      malId: seriesMalId,
      score: 8.73,
      voters: 1000,
      rank: 50,
      popularity: 20,
      members: 4000,
      airing: 'currently_airing',
      episodes: null,
      startDate: '1999-10-20',
      startSeason: { year: 1999, season: 'fall' },
      trailerYoutubeId: null,
      datesKnown: true,
      matchedTitle: 'One Piece',
      matchScore: 1,
      matchedBy: 'score',
      matcherVersion: 4,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    const seriesPage = {
      data: [
        {
          node: {
            id: seriesMalId,
            title: 'One Piece',
            start_season: { year: 1999, season: 'fall' },
            media_type: 'tv',
          },
        },
      ],
    };
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=one+piece+movie&', seriesPage)
      .get('begin:https://mal.test/v2/anime?q=One+Piece&', seriesPage)
      .get('begin:https://mal.test/v2/anime?q=one+piece&', seriesPage);

    await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug: movie, name: 'One Piece' }] });
    await app.get<MalFiller>(MAL_FILLER).idle();
    const later = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug: movie, name: 'One Piece' }] });

    expect(later.status).toBe(200);
    expect(later.body).toEqual({
      art: { [movie]: { status: 'none' } },
      ratings: {},
      avsStale: [movie],
    });
    const stored = (await app.get<MalStore>(MAL_STORE).find([movie])).get(
      movie,
    );
    expect(stored).toMatchObject({
      status: 'none',
      malId: null,
      reason: 'no candidate cleared the match',
    });
    expect(fetchMock).toHaveFetched(
      'begin:https://mal.test/v2/anime?q=One+Piece&',
    );
  });

  it('gives a same-named movie the entry its series relates to on MAL when search finds only the series', async () => {
    const { app, http } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const run = randomInt(1_000_000_000);
    // The taken ids come from every slug of this display name, so each test needs its own.
    const name = `Thám Tử Lừng Danh Conan ${run}`;
    const series = `tham-tu-lung-danh-conan-a${run}`;
    const movie = `tham-tu-lung-danh-conan-bong-ma-duong-baker-a${run}`;
    const seriesMalId = randomInt(1, 1_000_000_000);
    const phantom = seriesMalId + 1;
    const crossroad = seriesMalId + 2;
    const art = app.get<ArtStore>(ART_STORE);
    await art.saveMiss({ slug: series, name }, 'no_match', 'no art');
    await art.saveMiss({ slug: movie, name }, 'no_match', 'no art');
    await app.get<MalStore>(MAL_STORE).save({
      slug: series,
      status: 'ok',
      malId: seriesMalId,
      score: 8.17,
      voters: 1000,
      rank: 100,
      popularity: 200,
      members: 3000,
      airing: 'currently_airing',
      episodes: null,
      startDate: '1996-01-08',
      startSeason: { year: 1996, season: 'winter' },
      trailerYoutubeId: null,
      datesKnown: true,
      matchedTitle: 'Meitantei Conan',
      matchScore: 1,
      matchedBy: 'score',
      matcherVersion: 5,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=', {
        data: [
          {
            node: {
              id: seriesMalId,
              title: 'Meitantei Conan',
              media_type: 'tv',
            },
          },
        ],
      })
      .get(`begin:https://mal.test/v2/anime/${seriesMalId}?`, {
        id: seriesMalId,
        title: 'Meitantei Conan',
        media_type: 'tv',
        related_anime: [
          { node: { id: phantom }, relation_type: 'side_story' },
          { node: { id: crossroad }, relation_type: 'side_story' },
        ],
      })
      .get(`begin:https://mal.test/v2/anime/${phantom}?`, {
        id: phantom,
        title: 'Meitantei Conan: Baker Street no Bourei',
        alternative_titles: {
          en: 'Case Closed Movie 06: The Phantom of Baker Street',
        },
        start_date: '2002-04-20',
        media_type: 'movie',
        mean: 8.1,
        status: 'finished_airing',
        related_anime: [
          { node: { id: seriesMalId }, relation_type: 'parent_story' },
        ],
      })
      .get(`begin:https://mal.test/v2/anime/${crossroad}?`, {
        id: crossroad,
        title: 'Meitantei Conan: Meikyuu no Crossroad',
        alternative_titles: {
          en: 'Case Closed Movie 07: Crossroad in the Ancient Capital',
        },
        start_date: '2003-04-19',
        media_type: 'movie',
      })
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: String(phantom),
            confidence: 0.9,
            probabilities: { [phantom]: 0.98, [crossroad]: 0.02 },
          },
          any_match: { type: 'noul', noul: 0.7 },
        },
        usage: { input_tokens: 400, output_tokens: 20 },
      })
      .get(`https://tenrai.test/v1/anime/${phantom}/full`, {
        data: { trailer: null },
      })
      .get(`https://api.tenrai.org/v1/anime/${phantom}/episodes?page=1`, 404);

    await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug: movie, name }] });
    await app.get<MalFiller>(MAL_FILLER).idle();
    const later = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug: movie, name }] });

    expect(later.status).toBe(200);
    expect(later.body.ratings[movie].mal).toMatchObject({
      id: phantom,
      score: 8.1,
      startDate: '2002-04-20',
    });
    const stored = (await app.get<MalStore>(MAL_STORE).find([movie])).get(
      movie,
    );
    expect(stored).toMatchObject({
      status: 'ok',
      malId: phantom,
      matchedTitle: 'Meitantei Conan: Baker Street no Bourei',
      matchedBy: 'franchise',
      matchScore: 0.7,
    });
    expect(fetchMock).toHaveFetched(
      new RegExp(
        `/v2/anime/${seriesMalId}\\?fields=[^&]*related_anime&nsfw=true$`,
      ),
    );
    expect(fetchMock).toHavePostedTimes(
      1,
      'https://api.typesafe.ai/v1/systemone',
    );
  });

  it('matches a second same-named movie without reading the franchise from MAL again', async () => {
    const { app, http } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const run = randomInt(1_000_000_000);
    // The taken ids come from every slug of this display name, so each test needs its own.
    const name = `Thám Tử Lừng Danh Conan ${run}`;
    const series = `tham-tu-lung-danh-conan-a${run}`;
    const first = `tham-tu-lung-danh-conan-bong-ma-duong-baker-a${run}`;
    const second = `tham-tu-lung-danh-conan-me-cung-co-do-a${run}`;
    const seriesMalId = randomInt(1, 1_000_000_000);
    const phantom = seriesMalId + 1;
    const crossroad = seriesMalId + 2;
    const art = app.get<ArtStore>(ART_STORE);
    await art.saveMiss({ slug: series, name }, 'no_match', 'no art');
    await art.saveMiss({ slug: first, name }, 'no_match', 'no art');
    await art.saveMiss({ slug: second, name }, 'no_match', 'no art');
    await app.get<MalStore>(MAL_STORE).save({
      slug: series,
      status: 'ok',
      malId: seriesMalId,
      score: 8.17,
      voters: 1000,
      rank: 100,
      popularity: 200,
      members: 3000,
      airing: 'currently_airing',
      episodes: null,
      startDate: '1996-01-08',
      startSeason: { year: 1996, season: 'winter' },
      trailerYoutubeId: null,
      datesKnown: true,
      matchedTitle: 'Meitantei Conan',
      matchScore: 1,
      matchedBy: 'score',
      matcherVersion: 5,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=', {
        data: [
          {
            node: {
              id: seriesMalId,
              title: 'Meitantei Conan',
              media_type: 'tv',
            },
          },
        ],
      })
      .get(`begin:https://mal.test/v2/anime/${seriesMalId}?`, {
        id: seriesMalId,
        title: 'Meitantei Conan',
        media_type: 'tv',
        related_anime: [
          { node: { id: phantom }, relation_type: 'side_story' },
          { node: { id: crossroad }, relation_type: 'side_story' },
        ],
      })
      .get(`begin:https://mal.test/v2/anime/${phantom}?`, {
        id: phantom,
        title: 'Meitantei Conan: Baker Street no Bourei',
        media_type: 'movie',
        related_anime: [
          { node: { id: seriesMalId }, relation_type: 'parent_story' },
        ],
      })
      .get(`begin:https://mal.test/v2/anime/${crossroad}?`, {
        id: crossroad,
        title: 'Meitantei Conan: Meikyuu no Crossroad',
        media_type: 'movie',
      })
      .post(
        'https://api.typesafe.ai/v1/systemone',
        {
          model: 'jev-1.13.0',
          answers: {
            match: {
              type: 'choice',
              choice: String(phantom),
              confidence: 0.9,
              probabilities: { [phantom]: 0.98, [crossroad]: 0.02 },
            },
            any_match: { type: 'noul', noul: 0.7 },
          },
          usage: { input_tokens: 400, output_tokens: 20 },
        },
        { repeat: 1 },
      )
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: String(crossroad),
            confidence: 0.9,
            probabilities: { [crossroad]: 0.97 },
          },
          any_match: { type: 'noul', noul: 0.8 },
        },
        usage: { input_tokens: 400, output_tokens: 20 },
      })
      .get(`https://tenrai.test/v1/anime/${phantom}/full`, {
        data: { trailer: null },
      })
      .get(`https://api.tenrai.org/v1/anime/${phantom}/episodes?page=1`, 404)
      .get(`https://tenrai.test/v1/anime/${crossroad}/full`, {
        data: { trailer: null },
      })
      .get(
        `https://api.tenrai.org/v1/anime/${crossroad}/episodes?page=1`,
        404,
      );

    await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug: first, name }] });
    await app.get<MalFiller>(MAL_FILLER).idle();
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug: second, name }] });
    await app.get<MalFiller>(MAL_FILLER).idle();

    const stored = await app.get<MalStore>(MAL_STORE).find([first, second]);
    expect(stored.get(first)).toMatchObject({
      status: 'ok',
      malId: phantom,
      matchedBy: 'franchise',
    });
    expect(stored.get(second)).toMatchObject({
      status: 'ok',
      malId: crossroad,
      matchedBy: 'franchise',
    });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      `begin:https://mal.test/v2/anime/${seriesMalId}?`,
    );
    expect(fetchMock).toHaveFetchedTimes(
      1,
      `begin:https://mal.test/v2/anime/${phantom}?`,
    );
    expect(fetchMock).toHavePostedTimes(
      2,
      'https://api.typesafe.ai/v1/systemone',
    );
  });

  it('leaves a same-named movie unmatched when Jev is not sure enough which franchise entry it is', async () => {
    const { app, http } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const run = randomInt(1_000_000_000);
    // The taken ids come from every slug of this display name, so each test needs its own.
    const name = `Thám Tử Lừng Danh Conan ${run}`;
    const series = `tham-tu-lung-danh-conan-a${run}`;
    const movie = `tham-tu-lung-danh-conan-tien-dao-thu-11-a${run}`;
    const seriesMalId = randomInt(1, 1_000_000_000);
    const striker = seriesMalId + 1;
    const art = app.get<ArtStore>(ART_STORE);
    await art.saveMiss({ slug: series, name }, 'no_match', 'no art');
    await art.saveMiss({ slug: movie, name }, 'no_match', 'no art');
    await app.get<MalStore>(MAL_STORE).save({
      slug: series,
      status: 'ok',
      malId: seriesMalId,
      score: 8.17,
      voters: 1000,
      rank: 100,
      popularity: 200,
      members: 3000,
      airing: 'currently_airing',
      episodes: null,
      startDate: '1996-01-08',
      startSeason: { year: 1996, season: 'winter' },
      trailerYoutubeId: null,
      datesKnown: true,
      matchedTitle: 'Meitantei Conan',
      matchScore: 1,
      matchedBy: 'score',
      matcherVersion: 5,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=', {
        data: [
          {
            node: {
              id: seriesMalId,
              title: 'Meitantei Conan',
              media_type: 'tv',
            },
          },
        ],
      })
      .get(`begin:https://mal.test/v2/anime/${seriesMalId}?`, {
        id: seriesMalId,
        title: 'Meitantei Conan',
        media_type: 'tv',
        related_anime: [{ node: { id: striker }, relation_type: 'side_story' }],
      })
      .get(`begin:https://mal.test/v2/anime/${striker}?`, {
        id: striker,
        title: 'Meitantei Conan: Juuichininme no Striker',
        alternative_titles: {
          en: 'Detective Conan Movie 16: The Eleventh Striker',
        },
        media_type: 'movie',
      })
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: String(striker),
            confidence: 0.9,
            probabilities: { [striker]: 0.91 },
          },
          any_match: { type: 'noul', noul: 0.7 },
        },
        usage: { input_tokens: 400, output_tokens: 20 },
      });

    await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug: movie, name }] });
    await app.get<MalFiller>(MAL_FILLER).idle();
    const later = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug: movie, name }] });

    expect(later.status).toBe(200);
    expect(later.body).toEqual({
      art: { [movie]: { status: 'none' } },
      ratings: {},
      avsStale: [movie],
    });
    const stored = (await app.get<MalStore>(MAL_STORE).find([movie])).get(
      movie,
    );
    expect(stored).toMatchObject({
      status: 'none',
      malId: null,
      matchedBy: null,
      reason: `franchise rejected: best ${striker} p=0.91 noul=0.70`,
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
