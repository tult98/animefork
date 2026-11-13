import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { createEpisodeSiteClient } from '../../src/episodes/episode.client.ts';

describe('episode site client', () => {
  // The app's client waits a second between requests and five before a retry, so this runs a client without the waits.
  it('reads every page of a long list, and asks once more for a page that answers 503', async () => {
    const client = createEpisodeSiteClient({
      baseUrl: 'https://tenrai.test/v1',
      gapMs: 0,
      retryMs: 0,
    });
    fetchMock
      .get('https://tenrai.test/v1/anime/21/episodes?page=1', {
        pagination: { has_next_page: true },
        data: [
          {
            mal_id: 1,
            title: 'The Door to Hell',
            title_romanji: 'Jigoku no Tobira',
          },
        ],
      })
      .get('https://tenrai.test/v1/anime/21/episodes?page=2', 503, {
        repeat: 1,
      })
      .get('https://tenrai.test/v1/anime/21/episodes?page=2', {
        pagination: { has_next_page: false },
        data: [{ mal_id: 2, title: 'The Key' }],
      });

    const episodes = await client.list(21);

    expect(episodes).toEqual([
      {
        number: 1,
        title: 'The Door to Hell',
        titleAlt: 'Jigoku no Tobira',
        aired: null,
        synopsis: null,
      },
      {
        number: 2,
        title: 'The Key',
        titleAlt: null,
        aired: null,
        synopsis: null,
      },
    ]);
    expect(fetchMock).toHaveFetchedTimes(
      2,
      'https://tenrai.test/v1/anime/21/episodes?page=2',
    );
  });
});
