import { randomInt } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import type { MalFiller } from '../../src/mal/mal.filler.ts';
import { MAL_FILLER } from '../../src/mal/mal.module.ts';
import { MAL_STORE, type MalStore } from '../../src/mal/mal.store.ts';
import { buildApp } from '../test-app.ts';

describe('MAL filler', () => {
  it('matches a title by its name and stores its MAL numbers, its promo video and how it was matched', async () => {
    const { app } = await buildApp({
      now: new Date('2026-03-01T00:00:00Z'),
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Black+Clover&', {
        data: [
          {
            node: {
              id: malId,
              title: 'Black Clover',
              alternative_titles: { synonyms: ['BC'], en: 'Black Clover' },
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
          { node: { title: 'A node without an id is skipped' } },
        ],
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, {
        data: { trailer: { youtube_id: 'abc123' } },
      })
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);

    await app.get<MalFiller>(MAL_FILLER).fill({
      slug,
      name: 'Black Clover',
      year: 2017,
      episodeCount: 170,
    });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toEqual({
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
      trailerYoutubeId: 'abc123',
      datesKnown: true,
      matchedTitle: 'Black Clover',
      matchScore: 1,
      matchedBy: 'score',
      matcherVersion: 4,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    expect(fetchMock).toHaveFetchedTimes(1, 'begin:https://mal.test/v2/anime');
    expect(fetchMock).toHaveFetched('begin:https://mal.test/v2/anime', {
      query: { q: 'Black Clover', limit: '10', nsfw: 'true' },
      headers: { 'X-MAL-CLIENT-ID': 'abc' },
    });
    expect(fetchMock).toHaveFetched(
      `https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`,
    );
    expect(fetchMock).not.toHaveFetched('begin:https://api.typesafe.ai');
  });

  it('stores null for every number MAL leaves out', async () => {
    const { app } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `new-show-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=New+Show&', {
        data: [
          {
            node: {
              id: malId,
              title: 'New Show',
              media_type: 'tv',
              num_episodes: 0,
              status: 'on_hiatus',
              start_date: 'soon',
              start_season: { year: 2027, season: 'monsoon' },
            },
          },
        ],
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, {
        data: { trailer: null },
      })
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);

    await app
      .get<MalFiller>(MAL_FILLER)
      .fill({ slug, name: 'New Show', year: 2027 });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({
      status: 'ok',
      malId,
      score: null,
      voters: null,
      rank: null,
      popularity: null,
      members: null,
      airing: null,
      episodes: null,
      startDate: null,
      startSeason: null,
      trailerYoutubeId: null,
    });
  });

  it('searches the other names the source lists before its translated name', async () => {
    const { app } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `dau-la-dai-luc-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Douluo+Dalu&', {
        data: [
          {
            node: {
              id: malId,
              title: 'Douluo Dalu',
              alternative_titles: { en: 'Soul Land' },
              start_season: { year: 2018, season: 'winter' },
              num_episodes: 52,
              media_type: 'ona',
            },
          },
        ],
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, 503)
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);

    await app.get<MalFiller>(MAL_FILLER).fill({
      slug,
      name: 'Đấu La Đại Lục',
      year: 2018,
      episodeCount: 52,
      otherNames: ['Douluo Dalu', 'Soul Land'],
    });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({
      status: 'ok',
      malId,
      matchedTitle: 'Douluo Dalu',
      matchedBy: 'score',
    });
    expect(fetchMock).toHaveFetchedTimes(1, 'begin:https://mal.test/v2/anime');
  });

  it('searches a name TMDB knows the show by only after the source’s own names find nothing', async () => {
    const { app } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `conan-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Conan&', { data: [] })
      .get('begin:https://mal.test/v2/anime?q=conan&', { data: [] })
      .get('begin:https://mal.test/v2/anime?q=Case+Closed&', {
        data: [
          {
            node: {
              id: malId,
              title: 'Meitantei Conan',
              alternative_titles: { en: 'Case Closed' },
              media_type: 'tv',
            },
          },
        ],
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, 503)
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);

    await app
      .get<MalFiller>(MAL_FILLER)
      .fill({ slug, name: 'Conan' }, async () => ['Case Closed']);

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({
      status: 'ok',
      malId,
      matchedTitle: 'Meitantei Conan',
    });
    expect(fetchMock).toHaveNthFetched(
      3,
      'begin:https://mal.test/v2/anime?q=Case+Closed&',
    );
  });

  it('stores a no-match with its reason when no candidate is the show, and leaves Jev out when it is off', async () => {
    const { app } = await buildApp({
      env: { MAL_CLIENT_ID: 'abc', MAL_API_BASE: 'https://mal.test/v2' },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    fetchMock.get('begin:https://mal.test/v2/anime?q=', {
      data: [
        {
          node: {
            id: randomInt(1, 2_000_000_000),
            title: 'Naruto',
            start_season: { year: 2002, season: 'fall' },
            num_episodes: 220,
            media_type: 'tv',
          },
        },
      ],
    });

    await app.get<MalFiller>(MAL_FILLER).fill({
      slug,
      name: 'Black Clover',
      year: 2017,
      episodeCount: 170,
    });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({
      status: 'none',
      malId: null,
      score: null,
      matchedBy: null,
      reason: 'no candidate cleared the match',
      fetchedAt: null,
    });
  });

  it('stores a failure when MAL answers 429, and fails the next title without calling MAL again', async () => {
    const { app } = await buildApp({
      env: { MAL_CLIENT_ID: 'abc', MAL_API_BASE: 'https://mal.test/v2' },
    });
    const first = `black-clover-a${randomInt(1_000_000_000)}`;
    const second = `naruto-a${randomInt(1_000_000_000)}`;
    fetchMock.get('begin:https://mal.test/v2/anime?q=', 429);
    const filler = app.get<MalFiller>(MAL_FILLER);

    await filler.fill({ slug: first, name: 'Black Clover' });
    await filler.fill({ slug: second, name: 'Naruto' });

    const rows = await app.get<MalStore>(MAL_STORE).find([first, second]);
    expect(rows.get(first)).toMatchObject({
      status: 'failed',
      malId: null,
      reason: 'MAL /anime answered 429',
    });
    expect(rows.get(second)).toMatchObject({
      status: 'failed',
      reason: 'cooling down after a 429',
    });
    expect(fetchMock).toHaveFetchedTimes(1);
  });

  it('asks MAL once for a title requested twice at the same time', async () => {
    const { app } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Black+Clover&', {
        data: [
          { node: { id: malId, title: 'Black Clover', media_type: 'tv' } },
        ],
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, 503)
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);
    const filler = app.get<MalFiller>(MAL_FILLER);

    await Promise.all([
      filler.fill({ slug, name: 'Black Clover' }),
      filler.fill({ slug, name: 'Black Clover' }),
    ]);

    expect(fetchMock).toHaveFetchedTimes(1, 'begin:https://mal.test/v2/anime');
  });

  it('does not call MAL for a title matched less than a week ago', async () => {
    const { app } = await buildApp({
      now: new Date('2026-03-01T00:00:00Z'),
      env: { MAL_CLIENT_ID: 'abc', MAL_API_BASE: 'https://mal.test/v2' },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    await app.get<MalStore>(MAL_STORE).save({
      slug,
      status: 'ok',
      malId: randomInt(1, 2_000_000_000),
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
      attemptedAt: new Date('2026-02-23T00:00:01Z'),
      fetchedAt: new Date('2026-02-23T00:00:01Z'),
    });

    await app.get<MalFiller>(MAL_FILLER).fill({ slug, name: 'Black Clover' });

    expect(fetchMock).toHaveFetchedTimes(0);
  });

  it('refreshes a week-old match by its MAL id without searching, and keeps the promo video when Tenrai is down', async () => {
    const { app } = await buildApp({
      now: new Date('2026-03-01T00:00:00Z'),
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({
      slug,
      status: 'ok',
      malId,
      score: 7.55,
      voters: 69596,
      rank: 2006,
      popularity: 1762,
      members: 157000,
      airing: 'currently_airing',
      episodes: null,
      startDate: null,
      startSeason: null,
      trailerYoutubeId: 'abc123',
      datesKnown: false,
      matchedTitle: 'Black Clover',
      matchScore: 0.987,
      matchedBy: 'jev',
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
        num_scoring_users: 70000,
        rank: 1500,
        popularity: 1700,
        num_list_users: 160000,
        status: 'finished_airing',
        num_episodes: 170,
        start_date: '2017-10-03',
        start_season: { year: 2017, season: 'fall' },
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, 503)
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);

    await app.get<MalFiller>(MAL_FILLER).fill({ slug, name: 'Black Clover' });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toEqual({
      slug,
      status: 'ok',
      malId,
      score: 8.01,
      voters: 70000,
      rank: 1500,
      popularity: 1700,
      members: 160000,
      airing: 'finished_airing',
      episodes: 170,
      startDate: '2017-10-03',
      startSeason: { year: 2017, season: 'fall' },
      trailerYoutubeId: 'abc123',
      datesKnown: true,
      matchedTitle: 'Black Clover',
      matchScore: 0.987,
      matchedBy: 'jev',
      matcherVersion: 3,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    expect(fetchMock).toHaveFetched(
      `begin:https://mal.test/v2/anime/${malId}?fields=`,
      { headers: { 'X-MAL-CLIENT-ID': 'abc' } },
    );
    expect(fetchMock).not.toHaveFetched('begin:https://mal.test/v2/anime?q=');
  });

  it('drops the stored promo video on a refresh when Tenrai says the title has none', async () => {
    const { app } = await buildApp({
      now: new Date('2026-03-01T00:00:00Z'),
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
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
      trailerYoutubeId: 'abc123',
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
        mean: 7.55,
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, {
        data: { trailer: { youtube_id: null } },
      })
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);

    await app.get<MalFiller>(MAL_FILLER).fill({ slug, name: 'Black Clover' });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)?.trailerYoutubeId).toBeNull();
  });

  it('keeps the old numbers when a refresh fails, and does not ask MAL again on the next fill', async () => {
    const { app } = await buildApp({
      now: new Date('2026-03-01T00:00:00Z'),
      env: { MAL_CLIENT_ID: 'abc', MAL_API_BASE: 'https://mal.test/v2' },
    });
    const slug = `black-clover-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
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
    fetchMock.get(`begin:https://mal.test/v2/anime/${malId}?fields=`, 500);
    const filler = app.get<MalFiller>(MAL_FILLER);

    await filler.fill({ slug, name: 'Black Clover' });
    await filler.fill({ slug, name: 'Black Clover' });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({
      status: 'ok',
      malId,
      score: 7.55,
      rank: 2006,
      fetchedAt: new Date('2026-02-22T00:00:00Z'),
    });
    expect(fetchMock).toHaveFetchedTimes(1);
  });

  it('saves the season Jev picks when the score cannot tell two seasons apart', async () => {
    const { app } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const slug = `tenken-II-a${randomInt(1_000_000_000)}`;
    const second = randomInt(1, 1_000_000_000);
    const first = second + 1;
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=', {
        data: [
          {
            node: {
              id: second,
              title: 'Tensei shitara Ken deshita II',
              alternative_titles: { en: 'Reincarnated as a Sword Season 2' },
              start_season: { year: 2026, season: 'winter' },
              num_episodes: 12,
              media_type: 'tv',
              mean: 7.9,
              status: 'currently_airing',
            },
          },
          {
            node: {
              id: first,
              title: 'Tensei shitara Ken deshita',
              alternative_titles: { en: 'Reincarnated as a Sword' },
              start_season: { year: 2022, season: 'fall' },
              num_episodes: 12,
              media_type: 'tv',
              mean: 7.6,
              status: 'finished_airing',
            },
          },
        ],
      })
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: String(second),
            confidence: 0.8,
            probabilities: { [second]: 0.93, [first]: 0.07 },
          },
          any_match: { type: 'noul', noul: 0.95 },
        },
        usage: { input_tokens: 400, output_tokens: 20 },
      })
      .get(`https://tenrai.test/v1/anime/${second}/full`, 503)
      .get(`https://api.tenrai.org/v1/anime/${second}/episodes?page=1`, 404);

    await app
      .get<MalFiller>(MAL_FILLER)
      .fill({ slug, name: 'TenKen II', year: 2026, episodeCount: 5 });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({
      status: 'ok',
      malId: second,
      score: 7.9,
      airing: 'currently_airing',
      matchedTitle: 'Tensei shitara Ken deshita II',
      matchedBy: 'jev',
      matchScore: 0.93,
      reason: null,
    });
    expect(fetchMock).toHavePostedTimes(
      1,
      'https://api.typesafe.ai/v1/systemone',
      { headers: { Authorization: 'Bearer jev-key' } },
    );
  });

  it('stores a no-match with Jev’s numbers when Jev is not sure enough', async () => {
    const { app } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const slug = `tenken-II-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=', {
        data: [
          {
            node: {
              id: malId,
              title: 'Tensei shitara Ken deshita',
              start_season: { year: 2022, season: 'fall' },
              num_episodes: 12,
              media_type: 'tv',
            },
          },
        ],
      })
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: String(malId),
            confidence: 0.8,
            probabilities: { [malId]: 0.62 },
          },
          any_match: { type: 'noul', noul: 0.71 },
        },
        usage: { input_tokens: 400, output_tokens: 20 },
      });

    await app
      .get<MalFiller>(MAL_FILLER)
      .fill({ slug, name: 'TenKen II', year: 2026, episodeCount: 5 });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({
      status: 'none',
      malId: null,
      matchedBy: null,
      reason: `jev rejected: best ${malId} p=0.62 noul=0.71`,
    });
  });

  it('stores a failure, not a no-match, when Jev refuses the key, so the title is tried again in 10 minutes', async () => {
    const { app } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const slug = `tenken-II-a${randomInt(1_000_000_000)}`;
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=', {
        data: [
          {
            node: {
              id: randomInt(1, 2_000_000_000),
              title: 'Tensei shitara Ken deshita',
              start_season: { year: 2022, season: 'fall' },
              num_episodes: 12,
              media_type: 'tv',
            },
          },
        ],
      })
      .post('https://api.typesafe.ai/v1/systemone', {
        status: 401,
        body: { detail: 'bad key' },
      });

    await app
      .get<MalFiller>(MAL_FILLER)
      .fill({ slug, name: 'TenKen II', year: 2026, episodeCount: 5 });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({ status: 'failed', malId: null });
  });
});
