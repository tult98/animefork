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
              id: 30983,
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
              '30983':
                'Detective Conan / 名探偵コナン, first aired 1996-01-08, 1100 episodes',
            },
          },
          any_match: { type: 'noul' },
          show_match: {
            type: 'choice',
            criteria: {
              '30983':
                'Detective Conan / 名探偵コナン, first aired 1996-01-08, 1100 episodes',
            },
          },
          any_show: { type: 'noul' },
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
      choice: '30983',
      confidence,
      probabilities: { '30983': probability },
    };
    fetchMock.post('https://api.typesafe.ai/v1/systemone', {
      ...mockJevReply,
      answers: {
        match: pick,
        any_match: { type: 'noul', noul },
        show_match: pick,
        any_show: { type: 'noul', noul },
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
          id: 30983,
          name: 'Detective Conan',
          originalName: '名探偵コナン',
          alternativeTitles: [],
        },
      ],
    });

    expect(answer.choice).toBe(choice);
  });

  it('answers the show question’s pick, not the season question’s, when only the show is sure', async () => {
    fetchMock.post('https://api.typesafe.ai/v1/systemone', {
      ...mockJevReply,
      answers: {
        match: {
          type: 'choice',
          choice: '120089',
          confidence: 0.8,
          probabilities: { '30983': 0.4, '120089': 0.6 },
        },
        any_match: { type: 'noul', noul: 0.3 },
        show_match: {
          type: 'choice',
          choice: '30983',
          confidence: 0.7,
          probabilities: { '30983': 0.93, '120089': 0.07 },
        },
        any_show: { type: 'noul', noul: 0.95 },
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
          id: 30983,
          name: 'Detective Conan',
          originalName: '名探偵コナン',
          alternativeTitles: [],
        },
        {
          id: 120089,
          name: "Detective Conan: Zero's Tea Time",
          originalName: '名探偵コナン ゼロの日常',
          alternativeTitles: [],
        },
      ],
    });

    expect(answer).toEqual({
      choice: 30983,
      probability: 0.93,
      by: 'jev',
      scope: 'show',
    });
  });

  it('throws when Jev picks an id that is not a candidate', async () => {
    fetchMock.post('https://api.typesafe.ai/v1/systemone', {
      ...mockJevReply,
      answers: {
        ...mockJevReply.answers,
        match: {
          type: 'choice',
          choice: '1',
          confidence: 0.8,
          probabilities: { '1': 0.92 },
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
          id: 30983,
          name: 'Detective Conan',
          originalName: '名探偵コナン',
          alternativeTitles: [],
        },
      ],
    });

    await expect(call).rejects.toThrow('Jev chose 1, which is not a candidate');
  });
});
