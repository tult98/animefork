import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { createMalClient, fitQuery } from '../../src/mal/mal.client.ts';

describe('MAL client', () => {
  it('sends calls made at the same time one after another, a second apart', async () => {
    let now = 1_000_000;
    const sleeps: number[] = [];
    const client = createMalClient({
      clientId: 'abc',
      baseUrl: 'https://mal.test/v2',
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    fetchMock.get('begin:https://mal.test/v2/anime?q=', { data: [] });

    await Promise.all([
      client.search('aaa'),
      client.search('bbb'),
      client.search('ccc'),
    ]);

    expect(sleeps).toEqual([1000, 1000]);
    expect(fetchMock).toHaveNthFetched(
      3,
      'begin:https://mal.test/v2/anime?q=ccc&',
    );
  });
});

describe('fitQuery', () => {
  it.each([
    [
      'leaves a title of 64 characters or fewer alone',
      'Black Clover',
      'Black Clover',
    ],
    [
      'cuts a longer title at the last word that fits, because MAL answers 400 past 64 characters',
      'Yowaki Max Reijou nanoni Ratsuwan Konyakusha-sama no Kake ni Notte Shimatta',
      'Yowaki Max Reijou nanoni Ratsuwan Konyakusha-sama no Kake ni',
    ],
    [
      'cuts a single long word at 64 characters',
      'x'.repeat(100),
      'x'.repeat(64),
    ],
  ])('%s', (_, query, sent) => {
    expect(fitQuery(query)).toBe(sent);
  });
});
