import { randomInt, randomUUID } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it, vi } from 'vitest';
import type { EpisodeFiller } from '../../src/episodes/episode.filler.ts';
import { EPISODE_FILLER } from '../../src/episodes/episodes.module.ts';
import { MAL_STORE, type MalStore } from '../../src/mal/mal.store.ts';
import { buildApp } from '../test-app.ts';
import { mockMalMatch } from './__mockData__/index.ts';

describe('episode info', () => {
  it('answers pending while the list is read, then the episodes in order with their Vietnamese titles and synopses', async () => {
    const { app, http } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'id',
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_API_BASE: 'https://deepseek.test',
      },
    });
    const slug = `black-clover-${randomUUID()}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({ ...mockMalMatch, slug, malId });
    // Tenrai answers late, so the first lookup is answered before the list is stored.
    fetchMock
      .get(
        `https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`,
        {
          pagination: { has_next_page: false },
          data: [
            { mal_id: 2, title: 'The Door', aired: null, synopsis: null },
            {
              mal_id: 1,
              title: 'The Boy',
              aired: '2017-10-03T00:00:00+00:00',
              synopsis: 'A boy wakes.\n\n(Source: Crunchyroll)',
            },
          ],
        },
        { delay: 300 },
      )
      .post(
        'https://deepseek.test/chat/completions',
        {
          choices: [
            {
              finish_reason: 'stop',
              message: { content: '["Cánh cửa","Cậu bé"]' },
            },
          ],
        },
        { repeat: 1 },
      )
      .post('https://deepseek.test/chat/completions', {
        choices: [
          {
            finish_reason: 'stop',
            message: { content: '["Một cậu bé thức dậy."]' },
          },
        ],
      });

    const first = await http().get(`/v1/episodes/${slug}`);

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ status: 'pending', episodes: [] });
    await vi.waitFor(() =>
      expect(fetchMock).toHaveFetched(
        `https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`,
      ),
    );
    await app.get<EpisodeFiller>(EPISODE_FILLER).idle();
    const second = await http().get(`/v1/episodes/${slug}`);
    expect(second.body).toEqual({
      status: 'ready',
      episodes: [
        {
          number: 1,
          title: 'The Boy',
          titleVi: 'Cậu bé',
          aired: '2017-10-03',
          synopsis: 'A boy wakes.',
          synopsisVi: 'Một cậu bé thức dậy.',
        },
        {
          number: 2,
          title: 'The Door',
          titleVi: 'Cánh cửa',
          aired: null,
          synopsis: null,
          synopsisVi: null,
        },
      ],
    });
    expect(fetchMock).toHaveFetchedTimes(
      2,
      'https://deepseek.test/chat/completions',
    );
  });

  it('answers pending for a title not matched on MyAnimeList yet, and none for one MyAnimeList does not have', async () => {
    const { app, http } = await buildApp({ env: { MAL_CLIENT_ID: 'id' } });
    const missed = `no-such-show-${randomUUID()}`;
    await app.get<MalStore>(MAL_STORE).save({
      ...mockMalMatch,
      slug: missed,
      status: 'none',
      malId: null,
      airing: null,
      fetchedAt: null,
      reason: 'no match',
    });

    const unknown = await http().get(`/v1/episodes/new-show-${randomUUID()}`);
    const none = await http().get(`/v1/episodes/${missed}`);

    expect(unknown.body).toEqual({ status: 'pending', episodes: [] });
    expect(none.body).toEqual({ status: 'none', episodes: [] });
    expect(fetchMock).toHaveFetchedTimes(0);
  });

  it('rejects a slug with characters a title never has', async () => {
    const { http } = await buildApp();

    const res = await http().get('/v1/episodes/bad_slug!');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
  });

  it('answers none when Tenrai has no list for the title, and asks Tenrai again only after 10 minutes', async () => {
    const { app, http, advance } = await buildApp({
      env: { MAL_CLIENT_ID: 'id' },
    });
    const slug = `black-clover-${randomUUID()}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({ ...mockMalMatch, slug, malId });
    const filler = app.get<EpisodeFiller>(EPISODE_FILLER);
    fetchMock.get(
      `https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`,
      404,
    );
    await filler.fill({ slug, malId, airing: 'finished_airing' });

    const res = await http().get(`/v1/episodes/${slug}`);

    expect(res.body).toEqual({ status: 'none', episodes: [] });
    advance(9 * 60_000);
    await filler.fill({ slug, malId, airing: 'finished_airing' });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      `https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`,
    );
    advance(2 * 60_000);
    const later = await http().get(`/v1/episodes/${slug}`);
    expect(later.body).toEqual({ status: 'pending', episodes: [] });
    await filler.fill({ slug, malId, airing: 'finished_airing' });
    expect(fetchMock).toHaveFetchedTimes(
      2,
      `https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`,
    );
  });

  it('answers the English list when DeepSeek is down', async () => {
    const { app, http } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'id',
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_API_BASE: 'https://deepseek.test',
      },
    });
    const slug = `black-clover-${randomUUID()}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({ ...mockMalMatch, slug, malId });
    const filler = app.get<EpisodeFiller>(EPISODE_FILLER);
    fetchMock
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, {
        pagination: { has_next_page: false },
        data: [{ mal_id: 1, title: 'The Boy', synopsis: 'A boy wakes.' }],
      })
      .post('https://deepseek.test/chat/completions', 400);
    await filler.fill({ slug, malId, airing: 'finished_airing' });
    await filler.idle();

    const res = await http().get(`/v1/episodes/${slug}`);

    expect(res.body).toEqual({
      status: 'ready',
      episodes: [
        {
          number: 1,
          title: 'The Boy',
          titleVi: null,
          aired: null,
          synopsis: 'A boy wakes.',
          synopsisVi: null,
        },
      ],
    });
  });

  it('reads an airing show again after a day, keeps the translation of an unchanged episode and translates the changed one again', async () => {
    const { app, http, advance } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'id',
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_API_BASE: 'https://deepseek.test',
      },
    });
    const slug = `black-clover-${randomUUID()}`;
    const malId = randomInt(1, 2_000_000_000);
    await app
      .get<MalStore>(MAL_STORE)
      .save({ ...mockMalMatch, slug, malId, airing: 'currently_airing' });
    const filler = app.get<EpisodeFiller>(EPISODE_FILLER);
    const completion = (content: string) => ({
      choices: [{ finish_reason: 'stop', message: { content } }],
    });
    fetchMock
      .get(
        `https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`,
        {
          pagination: { has_next_page: false },
          data: [
            { mal_id: 1, title: 'The Boy', synopsis: 'A boy wakes.' },
            { mal_id: 2, title: 'TBA', synopsis: 'To be announced.' },
          ],
        },
        { repeat: 1 },
      )
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, {
        pagination: { has_next_page: false },
        data: [
          { mal_id: 1, title: 'The Boy', synopsis: 'A boy wakes.' },
          { mal_id: 2, title: 'The Door', synopsis: 'He opens it.' },
        ],
      })
      .post(
        'https://deepseek.test/chat/completions',
        completion('["Cậu bé","Chưa công bố"]'),
        { repeat: 1 },
      )
      .post(
        'https://deepseek.test/chat/completions',
        completion('["Một cậu bé thức dậy.","Sẽ được công bố."]'),
        { repeat: 1 },
      )
      .post(
        'https://deepseek.test/chat/completions',
        completion('["Cánh cửa"]'),
        { repeat: 1 },
      )
      .post(
        'https://deepseek.test/chat/completions',
        completion('["Cậu ấy mở nó ra."]'),
        { repeat: 1 },
      );
    await filler.fill({ slug, malId, airing: 'currently_airing' });
    await filler.idle();
    advance(23 * 60 * 60_000);
    await filler.fill({ slug, malId, airing: 'currently_airing' });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      `https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`,
    );
    advance(2 * 60 * 60_000);
    await filler.fill({ slug, malId, airing: 'currently_airing' });
    await filler.idle();

    const res = await http().get(`/v1/episodes/${slug}`);

    expect(res.body).toEqual({
      status: 'ready',
      episodes: [
        {
          number: 1,
          title: 'The Boy',
          titleVi: 'Cậu bé',
          aired: null,
          synopsis: 'A boy wakes.',
          synopsisVi: 'Một cậu bé thức dậy.',
        },
        {
          number: 2,
          title: 'The Door',
          titleVi: 'Cánh cửa',
          aired: null,
          synopsis: 'He opens it.',
          synopsisVi: 'Cậu ấy mở nó ra.',
        },
      ],
    });
    expect(fetchMock).toHaveFetchedTimes(
      4,
      'https://deepseek.test/chat/completions',
    );
  });
});
