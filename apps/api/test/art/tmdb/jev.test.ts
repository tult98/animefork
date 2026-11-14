import fetchMock from '@fetch-mock/vitest';
import { AuthenticationError } from '@typesafe-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  createJevClient,
  createMatcher,
  JevMatcher,
} from '../../../src/art/tmdb/jev.ts';
import { syncTitle } from '../../../src/art/tmdb/sync.ts';
import { createTmdbClient } from '../../../src/art/tmdb/tmdb.ts';
import {
  mockJevReply,
  mockTmdbConan,
  mockTmdbImages,
} from './__mockData__/index.ts';

describe('a sync with the Jev matcher on', () => {
  it('asks Jev about a title the baseline is unsure of and stores the match as made by jev', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Thám+Tử+Lừng+Danh+Conan',
        {
          results: [
            {
              id: 30983,
              name: 'Detective Conan',
              original_name: '名探偵コナン',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/30983?api_key=key', mockTmdbConan)
      .get(
        'https://api.themoviedb.org/3/tv/30983/alternative_titles?api_key=key',
        { results: [{ title: 'Case Closed' }] },
      )
      .get(
        'https://api.themoviedb.org/3/tv/30983/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://api.themoviedb.org/3/tv/30983/season/1?api_key=key', {
        episodes: [{ episode_number: 1, still_path: '/e1.jpg' }],
      })
      .post('https://api.typesafe.ai/v1/systemone', mockJevReply);

    const outcome = await syncTitle(
      {
        slug: 'meitantei-conan-a1',
        name: 'Thám Tử Lừng Danh Conan',
        otherNames: ['Conan'],
        year: 1996,
        episodeCount: 1100,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: createMatcher(
          {
            apiKey: 'test-jev-key',
            model: 'jev-latest',
            minNoul: 0.85,
            minChoice: 0.85,
            minConfidence: 0.5,
          },
          undefined,
          { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
        ),
      },
    );

    expect(outcome).toMatchObject({
      kind: 'matched',
      matched: {
        tmdbId: 30983,
        probability: 0.92,
        title: { tmdb_season: 1, match_scope: 'season', matched_by: 'jev' },
        episodes: [{ episode_number: 1, still_path: '/e1.jpg' }],
      },
    });
    expect(fetchMock).toHavePostedTimes(
      1,
      'https://api.typesafe.ai/v1/systemone',
    );
    expect(fetchMock).toHavePosted('https://api.typesafe.ai/v1/systemone', {
      headers: { authorization: 'Bearer test-jev-key' },
      matchPartialBody: true,
      body: {
        model: 'jev-latest',
        state: {
          source: {
            title: 'Thám Tử Lừng Danh Conan',
            romaji: 'meitantei conan',
            otherNames: ['Conan'],
            season: 1,
            year: 1996,
            episodeCount: 1100,
          },
          candidates: [
            {
              id: 'tv:30983',
              kind: 'tv series',
              title: 'Detective Conan',
              originalTitle: '名探偵コナン',
              alternativeTitles: ['Case Closed'],
              firstAirDate: '1996-01-08',
              episodeCount: 1100,
              overview: 'A high school detective is shrunk into a child.',
            },
          ],
        },
        questions: {
          match: {
            type: 'choice',
            criteria: {
              'tv:30983':
                'TV series: Detective Conan / 名探偵コナン, first aired 1996-01-08, 1100 episodes',
            },
          },
          any_match: { type: 'noul' },
          show_match: {
            type: 'choice',
            criteria: {
              'tv:30983':
                'TV series: Detective Conan / 名探偵コナン, first aired 1996-01-08, 1100 episodes',
            },
          },
          any_show: { type: 'noul' },
          side_entry: { type: 'noul' },
        },
      },
    });
  });

  it('does not ask Jev about a title the baseline already settles', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Thám+Tử+Lừng+Danh+Conan',
        {
          results: [
            {
              id: 30983,
              name: 'Detective Conan',
              original_name: '名探偵コナン',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/30983?api_key=key', mockTmdbConan)
      .get(
        'https://api.themoviedb.org/3/tv/30983/alternative_titles?api_key=key',
        { results: [{ title: 'Meitantei Conan' }] },
      )
      .get(
        'https://api.themoviedb.org/3/tv/30983/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://api.themoviedb.org/3/tv/30983/season/1?api_key=key', {
        episodes: [],
      });

    const outcome = await syncTitle(
      {
        slug: 'meitantei-conan-a1',
        name: 'Thám Tử Lừng Danh Conan',
        year: 1996,
        episodeCount: 1100,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: createMatcher(
          {
            apiKey: 'test-jev-key',
            model: 'jev-latest',
            minNoul: 0.85,
            minChoice: 0.85,
            minConfidence: 0.5,
          },
          undefined,
          { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
        ),
      },
    );

    expect(outcome).toMatchObject({
      kind: 'matched',
      matched: { tmdbId: 30983, title: { matched_by: 'baseline' } },
    });
    expect(fetchMock).not.toHaveFetched('https://api.typesafe.ai/v1/systemone');
  });

  it('skips the title and reports the season and show probabilities when Jev is sure of neither', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Thám+Tử+Lừng+Danh+Conan',
        {
          results: [
            {
              id: 30983,
              name: 'Detective Conan',
              original_name: '名探偵コナン',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/30983?api_key=key', mockTmdbConan)
      .get(
        'https://api.themoviedb.org/3/tv/30983/alternative_titles?api_key=key',
        { results: [] },
      )
      .post('https://api.typesafe.ai/v1/systemone', {
        ...mockJevReply,
        answers: {
          ...mockJevReply.answers,
          any_match: { type: 'noul', noul: 0.2 },
          any_show: { type: 'noul', noul: 0.4 },
        },
      });

    const outcome = await syncTitle(
      {
        slug: 'meitantei-conan-a1',
        name: 'Thám Tử Lừng Danh Conan',
        year: 1996,
        episodeCount: 1100,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: createMatcher(
          {
            apiKey: 'test-jev-key',
            model: 'jev-latest',
            minNoul: 0.85,
            minChoice: 0.85,
            minConfidence: 0.5,
          },
          undefined,
          { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
        ),
      },
    );

    expect(outcome).toEqual({
      kind: 'skipped',
      skipped: {
        slug: 'meitantei-conan-a1',
        reason:
          "no confident match by jev (best probability 0.20, show probability 0.40) via query 'Thám Tử Lừng Danh Conan'",
        sideEntry: false,
      },
    });
  });

  it('keeps the show’s backdrop and poster but no stills when Jev is sure of the show and not of the season', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Thám+Tử+Lừng+Danh+Conan',
        {
          results: [
            {
              id: 30983,
              name: 'Detective Conan',
              original_name: '名探偵コナン',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/30983?api_key=key', mockTmdbConan)
      .get(
        'https://api.themoviedb.org/3/tv/30983/alternative_titles?api_key=key',
        { results: [] },
      )
      .get(
        'https://api.themoviedb.org/3/tv/30983/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .post('https://api.typesafe.ai/v1/systemone', {
        ...mockJevReply,
        answers: {
          ...mockJevReply.answers,
          any_match: { type: 'noul', noul: 0.3 },
        },
      });

    const outcome = await syncTitle(
      {
        slug: 'meitantei-conan-a1',
        name: 'Thám Tử Lừng Danh Conan',
        year: 1996,
        episodeCount: 1100,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: createMatcher(
          {
            apiKey: 'test-jev-key',
            model: 'jev-latest',
            minNoul: 0.85,
            minChoice: 0.85,
            minConfidence: 0.5,
          },
          undefined,
          { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
        ),
      },
    );

    expect(outcome).toMatchObject({
      kind: 'matched',
      matched: {
        tmdbId: 30983,
        probability: 0.92,
        title: {
          tmdb_season: null,
          match_scope: 'show',
          backdrop_path: '/en.jpg',
          poster_path: '/poster-vi.jpg',
          matched_by: 'jev',
        },
        episodes: [],
      },
    });
    expect(fetchMock).not.toHaveFetched(
      'begin:https://api.themoviedb.org/3/tv/30983/season/',
    );
  });

  it('matches a movie to its own TMDB movie and keeps the movie’s backdrop without stills', async () => {
    fetchMock
      .get('https://api.themoviedb.org/3/search/tv?api_key=key&query=Naruto', {
        results: [{ id: 46260, name: 'Naruto', original_name: 'ナルト' }],
      })
      .get('begin:https://api.themoviedb.org/3/search/tv', { results: [] })
      .get('begin:https://api.themoviedb.org/3/search/movie', {
        results: [
          {
            id: 16910,
            title: 'Naruto the Movie: Legend of the Stone of Gelel',
            original_title: '劇場版 NARUTO 大激突!幻の地底遺跡だってばよ',
            genre_ids: [16, 28],
          },
          {
            id: 99,
            title: 'Naruto Live',
            original_title: 'Naruto Live',
            genre_ids: [28],
          },
        ],
      })
      .get('https://api.themoviedb.org/3/tv/46260?api_key=key', {
        id: 46260,
        name: 'Naruto',
        original_name: 'ナルト',
        number_of_episodes: 220,
        first_air_date: '2002-10-03',
      })
      .get(
        'https://api.themoviedb.org/3/tv/46260/alternative_titles?api_key=key',
        { results: [] },
      )
      .get('https://api.themoviedb.org/3/movie/16910?api_key=key', {
        id: 16910,
        title: 'Naruto the Movie: Legend of the Stone of Gelel',
        original_title: '劇場版 NARUTO 大激突!幻の地底遺跡だってばよ',
        release_date: '2005-08-06',
      })
      .get(
        'https://api.themoviedb.org/3/movie/16910/alternative_titles?api_key=key',
        { titles: [{ title: 'Naruto Movie 2' }] },
      )
      .post('https://api.typesafe.ai/v1/systemone', {
        ...mockJevReply,
        answers: {
          match: {
            type: 'choice',
            choice: 'movie:16910',
            confidence: 0.8,
            probabilities: { 'movie:16910': 0.93, 'tv:46260': 0.07 },
          },
          any_match: { type: 'noul', noul: 0.92 },
          show_match: {
            type: 'choice',
            choice: 'tv:46260',
            confidence: 0.8,
            probabilities: { 'movie:16910': 0.1, 'tv:46260': 0.9 },
          },
          any_show: { type: 'noul', noul: 0.95 },
          side_entry: { type: 'noul', noul: 0.97 },
        },
      })
      .get(
        'https://api.themoviedb.org/3/movie/16910/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      );

    const outcome = await syncTitle(
      {
        slug: 'naruto-movie-huyen-thoai-da-gelel-a1',
        name: 'Naruto: Huyền Thoại Đá Gelel',
        year: 2005,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: createMatcher(
          {
            apiKey: 'test-jev-key',
            model: 'jev-latest',
            minNoul: 0.85,
            minChoice: 0.85,
            minConfidence: 0.5,
          },
          undefined,
          { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
        ),
      },
    );

    expect(outcome).toMatchObject({
      kind: 'matched',
      matched: {
        tmdbKind: 'movie',
        tmdbId: 16910,
        title: {
          tmdb_kind: 'movie',
          tmdb_id: 16910,
          tmdb_season: null,
          match_scope: 'show',
          backdrop_path: '/en.jpg',
          poster_path: '/poster-vi.jpg',
          matched_by: 'jev',
        },
        episodes: [],
      },
    });
    expect(fetchMock).toHavePosted('https://api.typesafe.ai/v1/systemone', {
      matchPartialBody: true,
      body: {
        questions: {
          match: {
            criteria: {
              'tv:46260':
                'TV series: Naruto / ナルト, first aired 2002-10-03, 220 episodes',
              'movie:16910':
                'Movie: Naruto the Movie: Legend of the Stone of Gelel / 劇場版 NARUTO 大激突!幻の地底遺跡だってばよ, released 2005-08-06',
            },
          },
        },
      },
    });
    expect(fetchMock).not.toHaveFetched(
      'begin:https://api.themoviedb.org/3/movie/99',
    );
    expect(fetchMock).not.toHaveFetched(
      'begin:https://api.themoviedb.org/3/tv/46260/images',
    );
  });

  it('throws when Jev refuses the key, so the title is not stored as unmatched', async () => {
    fetchMock
      .get(
        'https://api.themoviedb.org/3/search/tv?api_key=key&query=Thám+Tử+Lừng+Danh+Conan',
        {
          results: [
            {
              id: 30983,
              name: 'Detective Conan',
              original_name: '名探偵コナン',
            },
          ],
        },
      )
      .get('begin:https://api.themoviedb.org/3/search/movie', { results: [] })
      .get('https://api.themoviedb.org/3/tv/30983?api_key=key', mockTmdbConan)
      .get(
        'https://api.themoviedb.org/3/tv/30983/alternative_titles?api_key=key',
        { results: [] },
      )
      .post('https://api.typesafe.ai/v1/systemone', {
        status: 401,
        body: { detail: 'bad key' },
      });

    const call = syncTitle(
      {
        slug: 'meitantei-conan-a1',
        name: 'Thám Tử Lừng Danh Conan',
        year: 1996,
        episodeCount: 1100,
      },
      {
        tmdb: createTmdbClient({ apiKey: 'key' }),
        matcher: createMatcher(
          {
            apiKey: 'test-jev-key',
            model: 'jev-latest',
            minNoul: 0.85,
            minChoice: 0.85,
            minConfidence: 0.5,
          },
          undefined,
          { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
        ),
      },
    );

    await expect(call).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe('JevMatcher', () => {
  it.each([
    [
      'accepts a pick exactly at the three thresholds',
      { noul: 0.85, probability: 0.85, confidence: 0.5 },
      30983,
    ],
    [
      'rejects when "any candidate matches" is under the minimum',
      { noul: 0.84, probability: 0.92, confidence: 0.8 },
      null,
    ],
    [
      'rejects when the probability of the pick is under the minimum',
      { noul: 0.96, probability: 0.84, confidence: 0.8 },
      null,
    ],
    [
      'rejects when the confidence is under the minimum',
      { noul: 0.96, probability: 0.92, confidence: 0.49 },
      null,
    ],
  ])('%s', async (_, { noul, probability, confidence }, choice) => {
    const pick = {
      type: 'choice',
      choice: 'tv:30983',
      confidence,
      probabilities: { 'tv:30983': probability },
    };
    fetchMock.post('https://api.typesafe.ai/v1/systemone', {
      ...mockJevReply,
      answers: {
        match: pick,
        any_match: { type: 'noul', noul },
        show_match: pick,
        any_show: { type: 'noul', noul },
        side_entry: { type: 'noul', noul: 0.1 },
      },
    });
    const matcher = new JevMatcher(
      createJevClient(
        { apiKey: 'test-jev-key', model: 'jev-latest' },
        { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
      ),
      'jev-latest',
      { minNoul: 0.85, minChoice: 0.85, minConfidence: 0.5 },
    );

    const answer = await matcher.match({
      slug: 'meitantei-conan-a1',
      sourceTitle: 'Thám Tử Lừng Danh Conan',
      season: 1,
      candidates: [
        {
          kind: 'tv',
          id: 30983,
          name: 'Detective Conan',
          originalName: '名探偵コナン',
          alternativeTitles: [],
        },
      ],
    });

    expect(answer.choice).toBe(choice);
  });

  it('falls back to the TV series at show scope for a season it cannot confirm, beside a movie with the same id', async () => {
    fetchMock.post('https://api.typesafe.ai/v1/systemone', {
      ...mockJevReply,
      answers: {
        match: {
          type: 'choice',
          choice: 'tv:120089',
          confidence: 0.8,
          probabilities: { 'tv:30983': 0.4, 'tv:120089': 0.6 },
        },
        any_match: { type: 'noul', noul: 0.3 },
        show_match: {
          type: 'choice',
          choice: 'tv:30983',
          confidence: 0.7,
          probabilities: { 'tv:30983': 0.93, 'tv:120089': 0.07 },
        },
        any_show: { type: 'noul', noul: 0.95 },
        side_entry: { type: 'noul', noul: 0.1 },
      },
    });
    const matcher = new JevMatcher(
      createJevClient(
        { apiKey: 'test-jev-key', model: 'jev-latest' },
        { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
      ),
      'jev-latest',
      { minNoul: 0.85, minChoice: 0.85, minConfidence: 0.5 },
    );

    const answer = await matcher.match({
      slug: 'meitantei-conan-a1',
      sourceTitle: 'Thám Tử Lừng Danh Conan',
      season: 1,
      year: 2024,
      candidates: [
        {
          kind: 'tv',
          id: 30983,
          name: 'Detective Conan',
          originalName: '名探偵コナン',
          alternativeTitles: [],
          showFirstAirDate: '1996-01-08',
        },
        {
          kind: 'movie',
          id: 30983,
          name: 'Detective Conan: The Time-Bombed Skyscraper',
          originalName: '名探偵コナン 時計じかけの摩天楼',
          alternativeTitles: [],
          firstAirDate: '1997-04-19',
        },
        {
          kind: 'tv',
          id: 120089,
          name: "Detective Conan: Zero's Tea Time",
          originalName: '名探偵コナン ゼロの日常',
          alternativeTitles: [],
        },
      ],
    });

    expect(answer).toEqual({
      choice: 30983,
      kind: 'tv',
      probability: 0.93,
      by: 'jev',
      scope: 'show',
      sideEntry: false,
    });
  });

  it('never answers a movie with the TV series of its franchise, even when the show answer is sure of it', async () => {
    fetchMock.post('https://api.typesafe.ai/v1/systemone', {
      ...mockJevReply,
      answers: {
        match: {
          type: 'choice',
          choice: 'tv:46260',
          confidence: 0.4,
          probabilities: { 'tv:46260': 0.5 },
        },
        any_match: { type: 'noul', noul: 0.3 },
        show_match: {
          type: 'choice',
          choice: 'tv:46260',
          confidence: 0.9,
          probabilities: { 'tv:46260': 0.97 },
        },
        any_show: { type: 'noul', noul: 0.96 },
        side_entry: { type: 'noul', noul: 0.9 },
      },
    });
    const matcher = new JevMatcher(
      createJevClient(
        { apiKey: 'test-jev-key', model: 'jev-latest' },
        { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
      ),
      'jev-latest',
      { minNoul: 0.85, minChoice: 0.85, minConfidence: 0.5 },
    );

    const answer = await matcher.match({
      slug: 'naruto-huyen-thoai-da-gelel-a1',
      sourceTitle: 'Naruto: Huyền Thoại Đá Gelel',
      season: 1,
      year: 2005,
      candidates: [
        {
          kind: 'tv',
          id: 46260,
          name: 'Naruto',
          originalName: 'ナルト',
          alternativeTitles: [],
          showFirstAirDate: '2002-10-03',
        },
      ],
    });

    expect(answer).toMatchObject({ choice: null, showProbability: 0.96 });
  });

  it('turns down a show answer whose TV series first aired years after the source', async () => {
    fetchMock.post('https://api.typesafe.ai/v1/systemone', {
      ...mockJevReply,
      answers: {
        match: {
          type: 'choice',
          choice: 'tv:70881',
          confidence: 0.4,
          probabilities: { 'tv:70881': 0.5 },
        },
        any_match: { type: 'noul', noul: 0.3 },
        show_match: {
          type: 'choice',
          choice: 'tv:70881',
          confidence: 0.9,
          probabilities: { 'tv:70881': 0.95 },
        },
        any_show: { type: 'noul', noul: 0.9 },
        side_entry: { type: 'noul', noul: 0.4 },
      },
    });
    const matcher = new JevMatcher(
      createJevClient(
        { apiKey: 'test-jev-key', model: 'jev-latest' },
        { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
      ),
      'jev-latest',
      { minNoul: 0.85, minChoice: 0.85, minConfidence: 0.5 },
    );

    const answer = await matcher.match({
      slug: 'boruto-naruto-hau-truyen-a1',
      sourceTitle: 'Boruto: Naruto Hậu Truyện',
      season: 1,
      year: 2015,
      candidates: [
        {
          kind: 'tv',
          id: 70881,
          name: 'Boruto: Naruto Next Generations',
          originalName: 'BORUTO-ボルト- NARUTO NEXT GENERATIONS',
          alternativeTitles: [],
          firstAirDate: '2017-04-05',
          showFirstAirDate: '2017-04-05',
        },
      ],
    });

    expect(answer).toMatchObject({ choice: null, showProbability: 0.9 });
  });

  it('throws when Jev picks an id that is not a candidate', async () => {
    fetchMock.post('https://api.typesafe.ai/v1/systemone', {
      ...mockJevReply,
      answers: {
        ...mockJevReply.answers,
        match: {
          type: 'choice',
          choice: 'tv:1',
          confidence: 0.8,
          probabilities: { 'tv:1': 0.92 },
        },
      },
    });
    const matcher = new JevMatcher(
      createJevClient(
        { apiKey: 'test-jev-key', model: 'jev-latest' },
        { compression: false, logLevel: 'off', retry: { maxRetries: 0 } },
      ),
      'jev-latest',
      { minNoul: 0.85, minChoice: 0.85, minConfidence: 0.5 },
    );

    const call = matcher.match({
      slug: 'meitantei-conan-a1',
      sourceTitle: 'Thám Tử Lừng Danh Conan',
      season: 1,
      candidates: [
        {
          kind: 'tv',
          id: 30983,
          name: 'Detective Conan',
          originalName: '名探偵コナン',
          alternativeTitles: [],
        },
      ],
    });

    await expect(call).rejects.toThrow(
      'Jev chose tv:1, which is not a candidate',
    );
  });
});
