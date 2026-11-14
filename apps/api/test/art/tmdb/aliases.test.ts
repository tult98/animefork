import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { tmdbAliases } from '../../../src/art/tmdb/aliases.ts';
import { createTmdbClient } from '../../../src/art/tmdb/tmdb.ts';

describe('tmdbAliases', () => {
  it('lists the Latin names of a show once each, without names in other scripts or under 3 letters', async () => {
    fetchMock
      .get('https://api.themoviedb.org/3/tv/30983?api_key=key', {
        id: 30983,
        name: 'Case Closed',
        original_name: '名探偵コナン',
        number_of_episodes: 1100,
      })
      .get(
        'https://api.themoviedb.org/3/tv/30983/alternative_titles?api_key=key',
        {
          results: [
            { title: 'Detective Conan' },
            { title: 'Case Closed' },
            { title: '名探偵コナン' },
            { title: 'DC' },
          ],
        },
      );

    const names = await tmdbAliases(
      createTmdbClient({ apiKey: 'key' }),
      'tv',
      30983,
    );

    expect(names).toEqual(['Case Closed', 'Detective Conan']);
  });
});
