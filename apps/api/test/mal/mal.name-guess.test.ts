import { randomInt } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import type { MalFiller } from '../../src/mal/mal.filler.ts';
import { MAL_FILLER } from '../../src/mal/mal.module.ts';
import { MAL_STORE, type MalStore } from '../../src/mal/mal.store.ts';
import {
  NAME_GUESS_STORE,
  type NameGuessStore,
} from '../../src/mal/name-guess.store.ts';
import { buildApp } from '../test-app.ts';

describe('MAL name guesses', () => {
  it('matches a Vietnamese-named title MAL cannot find through the real names DeepSeek gives, and keeps the guess', async () => {
    const { app } = await buildApp({
      now: new Date('2026-03-01T00:00:00Z'),
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
        DEEPSEEK_API_KEY: 'deepseek-key',
        DEEPSEEK_API_BASE: 'https://deepseek.test',
      },
    });
    const slug = `tien-nghich-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Ti%C3%AAn+Ngh%E1%BB%8Bch&', {
        data: [],
      })
      .get('begin:https://mal.test/v2/anime?q=tien+nghich&', { data: [] })
      .post('https://deepseek.test/chat/completions', {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content:
                '{"known": true, "original": "仙逆", "romanized": "Xian Ni", "english": "Renegade Immortal"}',
            },
          },
        ],
      })
      .get('begin:https://mal.test/v2/anime?q=Xian+Ni&', {
        data: [
          {
            node: {
              id: malId,
              title: 'Xian Ni',
              alternative_titles: { en: 'Renegade Immortal' },
              start_season: { year: 2023, season: 'fall' },
              media_type: 'ona',
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
      .fill({ slug, name: 'Tiên Nghịch', year: 2023 });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({
      status: 'ok',
      malId,
      matchedTitle: 'Xian Ni',
      matchedBy: 'score',
      matcherVersion: 8,
    });
    expect(await app.get<NameGuessStore>(NAME_GUESS_STORE).find(slug)).toEqual({
      known: true,
      names: ['Xian Ni', 'Renegade Immortal', '仙逆'],
    });
    expect(fetchMock).toHavePosted('https://deepseek.test/chat/completions', {
      headers: { authorization: 'Bearer deepseek-key' },
      body: {
        model: 'deepseek-flash',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system' },
          {
            role: 'user',
            content:
              '<name>Tiên Nghịch</name>\n<slug>tien nghich</slug>\n(year 2023)',
          },
        ],
      },
      matchPartialBody: true,
    });
    expect(fetchMock).not.toHavePosted(
      'https://deepseek.test/chat/completions',
      { body: { thinking: { type: 'disabled' } }, matchPartialBody: true },
    );
    expect(fetchMock).not.toHaveFetched(
      'begin:https://mal.test/v2/anime?q=Renegade+Immortal&',
    );
  });

  it('keeps a title DeepSeek does not know a no-match, and does not ask DeepSeek again on the retry', async () => {
    const { app, advance } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        DEEPSEEK_API_KEY: 'deepseek-key',
        DEEPSEEK_API_BASE: 'https://deepseek.test',
      },
    });
    const slug = `ma-than-ky-a${randomInt(1_000_000_000)}`;
    fetchMock
      .get('begin:https://mal.test/v2/anime?q=Ma+Th%E1%BA%A7n+K%C3%BD&', {
        data: [],
      })
      .get('begin:https://mal.test/v2/anime?q=ma+than+ky&', { data: [] })
      .post('https://deepseek.test/chat/completions', {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content:
                '{"known": false, "original": "", "romanized": "", "english": ""}',
            },
          },
        ],
      });
    const filler = app.get<MalFiller>(MAL_FILLER);
    await filler.fill({ slug, name: 'Ma Thần Ký' });
    advance(8 * 24 * 60 * 60_000);

    await filler.fill({ slug, name: 'Ma Thần Ký' });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({
      status: 'none',
      malId: null,
      reason: 'no candidate cleared the match',
      attemptedAt: new Date('2026-03-09T00:00:00Z'),
    });
    expect(await app.get<NameGuessStore>(NAME_GUESS_STORE).find(slug)).toEqual({
      known: false,
    });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      'https://deepseek.test/chat/completions',
    );
    expect(fetchMock).toHaveFetchedTimes(4, 'begin:https://mal.test/v2/anime');
  });

  it('never asks DeepSeek about a title the source lists other names for', async () => {
    const { app } = await buildApp({
      env: {
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        DEEPSEEK_API_KEY: 'deepseek-key',
        DEEPSEEK_API_BASE: 'https://deepseek.test',
      },
    });
    const slug = `dau-pha-thuong-khung-a${randomInt(1_000_000_000)}`;
    fetchMock.get('begin:https://mal.test/v2/anime?q=', { data: [] });

    await app.get<MalFiller>(MAL_FILLER).fill({
      slug,
      name: 'Đấu Phá Thương Khung',
      otherNames: ['Doupo Cangqiong'],
    });

    const rows = await app.get<MalStore>(MAL_STORE).find([slug]);
    expect(rows.get(slug)).toMatchObject({ status: 'none', malId: null });
    expect(
      await app.get<NameGuessStore>(NAME_GUESS_STORE).find(slug),
    ).toBeUndefined();
    expect(fetchMock).not.toHaveFetched('begin:https://deepseek.test');
  });
});
