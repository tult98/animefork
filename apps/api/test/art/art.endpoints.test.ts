import { randomUUID } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { ArtFiller } from '../../src/art/art.filler.ts';
import { ART_STORE, type ArtStore } from '../../src/art/art.store.ts';
import { PG_POOL } from '../../src/database/migration-runner.ts';
import { buildApp } from '../test-app.ts';
import { mockTmdbImages, mockTmdbShow } from './__mockData__/index.ts';

describe('art lookup', () => {
  it('answers pending at once, then the art, the Vietnamese overview and the stills once TMDB is read', async () => {
    const { http, app } = await buildApp({
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `tonikaku-kawaii-${randomUUID()}`;
    const title = {
      slug,
      name: 'Tonikaku Kawaii',
      year: 2020,
      episodeCount: 12,
    };
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Tonikaku+Kawaii', {
        results: [
          {
            id: 100,
            name: 'Tonikaku Kawaii',
            original_name: 'トニカクカワイイ',
          },
        ],
      })
      .get('begin:https://tmdb.test/3/search/movie', { results: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key', mockTmdbShow)
      .get('https://tmdb.test/3/tv/100/alternative_titles?api_key=key', {
        results: [],
      })
      .get(
        'https://tmdb.test/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/100/season/1?api_key=key', {
        episodes: [
          { episode_number: 1, still_path: '/e1.jpg' },
          { episode_number: 2, still_path: null },
          { episode_number: 3, still_path: '/e3.jpg' },
        ],
      })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbShow,
        overview: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
      });

    const first = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      art: { [slug]: { status: 'pending' } },
      ratings: {},
      avsStale: [slug],
    });
    const later = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    const stills = await http().get(`/v1/art/stills/${slug}`);
    expect(later.body.art).toEqual({
      [slug]: {
        status: 'ready',
        backdropPath: '/backdrop-en.jpg',
        backdropLang: 'en',
        posterPath: '/poster-vi.jpg',
        overview: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
        overviewTranslated: false,
      },
    });
    expect(stills.status).toBe(200);
    expect(stills.body).toEqual({
      status: 'ready',
      stills: { '1': '/e1.jpg', '3': '/e3.jpg' },
    });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      'https://tmdb.test/3/search/tv?api_key=key&query=Tonikaku+Kawaii',
    );
  });

  it('rejects a lookup whose slug has a space', async () => {
    const { http } = await buildApp();

    const res = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug: 'Bad Slug', name: 'Tonikaku Kawaii' }] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_request',
      issues: [{ path: 'titles.0.slug', message: expect.any(String) }],
    });
  });

  it('searches TMDB once for a title asked again while it is being filled', async () => {
    const { http, app } = await buildApp({
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `nothing-here-${randomUUID()}`;
    const title = { slug, name: 'Nothing Here' };
    fetchMock.get(
      'begin:https://tmdb.test/3/search/',
      { results: [] },
      { delay: 100 },
    );

    const first = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title, title] });
    const second = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    expect(first.body.art).toEqual({ [slug]: { status: 'pending' } });
    expect(second.body.art).toEqual({ [slug]: { status: 'pending' } });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      'https://tmdb.test/3/search/tv?api_key=key&query=Nothing+Here',
    );
  });

  it('answers none for a title TMDB does not know, and searches again after a week', async () => {
    const { http, app, advance } = await buildApp({
      now: new Date(),
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `nothing-here-${randomUUID()}`;
    const title = { slug, name: 'Nothing Here' };
    fetchMock.get('begin:https://tmdb.test/3/search/', { results: [] });
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    const settled = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    advance(8 * 24 * 60 * 60_000);
    const retried = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    expect(settled.body.art).toEqual({ [slug]: { status: 'none' } });
    expect(retried.body.art).toEqual({ [slug]: { status: 'pending' } });
    expect(fetchMock).toHaveFetchedTimes(
      2,
      'https://tmdb.test/3/search/tv?api_key=key&query=Nothing+Here',
    );
  });

  it('answers none after TMDB fails, and fills the title on a lookup ten minutes later', async () => {
    const { http, app, advance } = await buildApp({
      now: new Date(),
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `tonikaku-kawaii-${randomUUID()}`;
    const title = { slug, name: 'Tonikaku Kawaii' };
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Tonikaku+Kawaii', {
        results: [
          {
            id: 100,
            name: 'Tonikaku Kawaii',
            original_name: 'トニカクカワイイ',
          },
        ],
      })
      .get('begin:https://tmdb.test/3/search/movie', { results: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key', mockTmdbShow)
      .get('https://tmdb.test/3/tv/100/alternative_titles?api_key=key', {
        results: [],
      })
      .get(
        'https://tmdb.test/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        500,
        { repeat: 1 },
      )
      .get(
        'https://tmdb.test/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/100/season/1?api_key=key', { episodes: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbShow,
        overview: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
      });
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    const failed = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    advance(11 * 60_000);
    const retried = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    expect(failed.body.art).toEqual({ [slug]: { status: 'none' } });
    expect(retried.body.art).toEqual({ [slug]: { status: 'pending' } });
    const filled = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    expect(filled.body.art[slug]).toMatchObject({
      status: 'ready',
      backdropPath: '/backdrop-en.jpg',
    });
  });

  it('translates an overview TMDB has only in English with DeepSeek', async () => {
    const { http, app } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        DEEPSEEK_API_KEY: 'deepseek-key',
        DEEPSEEK_API_BASE: 'https://deepseek.test',
      },
    });
    const slug = `tonikaku-kawaii-${randomUUID()}`;
    const title = { slug, name: 'Tonikaku Kawaii' };
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Tonikaku+Kawaii', {
        results: [
          {
            id: 100,
            name: 'Tonikaku Kawaii',
            original_name: 'トニカクカワイイ',
          },
        ],
      })
      .get('begin:https://tmdb.test/3/search/movie', { results: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key', mockTmdbShow)
      .get('https://tmdb.test/3/tv/100/alternative_titles?api_key=key', {
        results: [],
      })
      .get(
        'https://tmdb.test/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/100/season/1?api_key=key', { episodes: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbShow,
        overview: '',
      })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=en', {
        ...mockTmdbShow,
        overview: 'Nasa Yuzaki meets Tsukasa and proposes to her on the spot.',
      })
      .post('https://deepseek.test/chat/completions', {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
            },
          },
        ],
      });
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    const res = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });

    expect(res.body.art[slug]).toMatchObject({
      status: 'ready',
      overview: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
      overviewTranslated: true,
    });
    expect(fetchMock).toHavePosted('https://deepseek.test/chat/completions', {
      headers: { authorization: 'Bearer deepseek-key' },
      body: { model: 'deepseek-flash', stream: false },
      matchPartialBody: true,
    });
  });

  it('shows no overview when TMDB has only an English one and DeepSeek is off', async () => {
    const { http, app } = await buildApp({
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `tonikaku-kawaii-${randomUUID()}`;
    const title = { slug, name: 'Tonikaku Kawaii' };
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Tonikaku+Kawaii', {
        results: [
          {
            id: 100,
            name: 'Tonikaku Kawaii',
            original_name: 'トニカクカワイイ',
          },
        ],
      })
      .get('begin:https://tmdb.test/3/search/movie', { results: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key', mockTmdbShow)
      .get('https://tmdb.test/3/tv/100/alternative_titles?api_key=key', {
        results: [],
      })
      .get(
        'https://tmdb.test/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/100/season/1?api_key=key', { episodes: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbShow,
        overview: '',
      })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=en', {
        ...mockTmdbShow,
        overview: 'Nasa Yuzaki meets Tsukasa and proposes to her on the spot.',
      });
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    const res = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });

    expect(res.body.art[slug]).toEqual({
      status: 'ready',
      backdropPath: '/backdrop-en.jpg',
      backdropLang: 'en',
      posterPath: '/poster-vi.jpg',
      overview: null,
      overviewTranslated: false,
    });
  });

  it('keeps the art when the translation fails, and asks only for the overview again ten minutes later', async () => {
    const { http, app, advance } = await buildApp({
      now: new Date(),
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        DEEPSEEK_API_KEY: 'deepseek-key',
        DEEPSEEK_API_BASE: 'https://deepseek.test',
      },
    });
    const slug = `tonikaku-kawaii-${randomUUID()}`;
    const title = { slug, name: 'Tonikaku Kawaii' };
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Tonikaku+Kawaii', {
        results: [
          {
            id: 100,
            name: 'Tonikaku Kawaii',
            original_name: 'トニカクカワイイ',
          },
        ],
      })
      .get('begin:https://tmdb.test/3/search/movie', { results: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key', mockTmdbShow)
      .get('https://tmdb.test/3/tv/100/alternative_titles?api_key=key', {
        results: [],
      })
      .get(
        'https://tmdb.test/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/100/season/1?api_key=key', { episodes: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbShow,
        overview: '',
      })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=en', {
        ...mockTmdbShow,
        overview: 'Nasa Yuzaki meets Tsukasa and proposes to her on the spot.',
      })
      .post('https://deepseek.test/chat/completions', 400, { repeat: 1 })
      .post('https://deepseek.test/chat/completions', {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
            },
          },
        ],
      });
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    const untranslated = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    advance(11 * 60_000);
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    expect(untranslated.body.art[slug]).toMatchObject({
      status: 'ready',
      backdropPath: '/backdrop-en.jpg',
      overview: null,
    });
    const translated = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    expect(translated.body.art[slug]).toMatchObject({
      overview: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
      overviewTranslated: true,
    });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      'https://tmdb.test/3/search/tv?api_key=key&query=Tonikaku+Kawaii',
    );
  });

  it('asks Jev when the names do not settle the match, and serves a show it accepts without stills', async () => {
    const { http, app } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const slug = `tom-lai-em-rat-de-thuong-${randomUUID()}`;
    const title = { slug, name: 'Tóm Lại Em Rất Dễ Thương' };
    fetchMock
      .get(
        'https://tmdb.test/3/search/tv?api_key=key&query=Tóm+Lại+Em+Rất+Dễ+Thương',
        {
          results: [
            {
              id: 100,
              name: 'Tonikaku Kawaii',
              original_name: 'トニカクカワイイ',
            },
          ],
        },
      )
      .get('begin:https://tmdb.test/3/search/movie', { results: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key', mockTmdbShow)
      .get('https://tmdb.test/3/tv/100/alternative_titles?api_key=key', {
        results: [],
      })
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: 'tv:100',
            confidence: 0.3,
            probabilities: { 'tv:100': 0.4 },
          },
          any_match: { type: 'noul', noul: 0.2 },
          show_match: {
            type: 'choice',
            choice: 'tv:100',
            confidence: 0.9,
            probabilities: { 'tv:100': 0.95 },
          },
          any_show: { type: 'noul', noul: 0.95 },
          side_entry: { type: 'noul', noul: 0.1 },
        },
        usage: { input_tokens: 400, output_tokens: 30 },
      })
      .get(
        'https://tmdb.test/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbShow,
        overview: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
      });
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    const res = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    const stills = await http().get(`/v1/art/stills/${slug}`);

    expect(res.body.art[slug]).toEqual({
      status: 'ready',
      backdropPath: '/backdrop-en.jpg',
      backdropLang: 'en',
      posterPath: '/poster-vi.jpg',
      overview: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
      overviewTranslated: false,
    });
    expect(stills.body).toEqual({ status: 'ready', stills: {} });
    expect(fetchMock).toHavePosted('https://api.typesafe.ai/v1/systemone', {
      headers: { authorization: 'Bearer jev-key' },
    });
  });

  it('tries a title TMDB did not know again when its other names arrive, and finds it by them', async () => {
    const { http, app } = await buildApp({
      // The store stamps a row with the database clock, so the app clock starts an hour ahead of it
      // for the names to count as newer than the miss.
      now: new Date(Date.now() + 60 * 60_000),
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `dau-la-dai-luc-${randomUUID()}`;
    const title = { slug, name: 'Đấu La Đại Lục' };
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Soul+Land', {
        results: [{ id: 100, name: 'Soul Land', original_name: '斗罗大陆' }],
      })
      .get('begin:https://tmdb.test/3/search/', { results: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key', {
        ...mockTmdbShow,
        name: 'Soul Land',
        original_name: '斗罗大陆',
      })
      .get('https://tmdb.test/3/tv/100/alternative_titles?api_key=key', {
        results: [],
      })
      .get(
        'https://tmdb.test/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/100/season/1?api_key=key', { episodes: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbShow,
        overview: 'Đường Tam bước vào thế giới hồn sư.',
      });
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    const missed = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    const withNames = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ ...title, otherNames: ['Soul Land'] }] });
    await app.get(ArtFiller).idle();

    expect(missed.body.art).toEqual({ [slug]: { status: 'none' } });
    expect(withNames.body.art).toEqual({ [slug]: { status: 'pending' } });
    const found = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    expect(found.body.art[slug]).toMatchObject({
      status: 'ready',
      backdropPath: '/backdrop-en.jpg',
    });
  });

  it('searches by the other names it stored when a later lookup sends none', async () => {
    const { http, app, advance } = await buildApp({
      now: new Date(),
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `dau-la-dai-luc-${randomUUID()}`;
    const title = { slug, name: 'Đấu La Đại Lục' };
    fetchMock.get('begin:https://tmdb.test/3/search/', { results: [] });
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ ...title, otherNames: ['Soul Land'] }] });
    await app.get(ArtFiller).idle();
    advance(8 * 24 * 60 * 60_000);

    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    expect(fetchMock).toHaveFetchedTimes(
      2,
      'https://tmdb.test/3/search/tv?api_key=key&query=Soul+Land',
    );
  });

  it('answers the stored art of a title matched by the first matcher version, and refreshes it in the background', async () => {
    const { http, app } = await buildApp({
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `tonikaku-kawaii-${randomUUID()}`;
    const title = { slug, name: 'Tonikaku Kawaii' };
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Tonikaku+Kawaii', {
        results: [
          {
            id: 100,
            name: 'Tonikaku Kawaii',
            original_name: 'トニカクカワイイ',
          },
        ],
      })
      .get('begin:https://tmdb.test/3/search/movie', { results: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key', mockTmdbShow)
      .get('https://tmdb.test/3/tv/100/alternative_titles?api_key=key', {
        results: [],
      })
      .get(
        'https://tmdb.test/3/tv/100/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/100/season/1?api_key=key', { episodes: [] })
      .get('https://tmdb.test/3/tv/100?api_key=key&language=vi', {
        ...mockTmdbShow,
        overview: 'Nasa Yuzaki gặp Tsukasa và cầu hôn cô ngay tại chỗ.',
      });
    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();
    // No store method writes an old matcher version, so the row is aged in SQL.
    await app.get<pg.Pool>(PG_POOL).query(
      `update title_art set matcher_version = 1, backdrop_path = '/old.jpg', poster_path = null
          where source_slug = $1`,
      [slug],
    );

    const stored = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();

    expect(stored.body.art[slug]).toMatchObject({
      status: 'ready',
      backdropPath: '/old.jpg',
      posterPath: null,
    });
    const refreshed = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    expect(refreshed.body.art[slug]).toMatchObject({
      status: 'ready',
      backdropPath: '/backdrop-en.jpg',
      posterPath: '/poster-vi.jpg',
    });
    expect(fetchMock).toHaveFetchedTimes(
      2,
      'https://tmdb.test/3/search/tv?api_key=key&query=Tonikaku+Kawaii',
    );
  });
});

describe('episode stills', () => {
  it('answers the stills of a page from an episode number on, and an empty ready page past the last one', async () => {
    const { app, http } = await buildApp();
    const slug = `one-piece-${randomUUID()}`;
    await app.get<ArtStore>(ART_STORE).saveMatched({
      title: {
        source_slug: slug,
        tmdb_kind: 'tv',
        tmdb_id: 37854,
        tmdb_season: 1,
        match_scope: 'season',
        backdrop_path: '/backdrop.jpg',
        backdrop_lang: 'en',
        poster_path: null,
        poster_lang: null,
        source_name: 'One Piece',
        source_year: null,
        source_episode_count: null,
        matched_by: 'baseline',
      },
      episodes: [1, 2, 3, 4, 5].map((n) => ({
        source_slug: slug,
        episode_number: n,
        still_path: `/e${n}.jpg`,
      })),
    });

    const page = await http().get(`/v1/art/stills/${slug}?from=2&limit=2`);
    const past = await http().get(`/v1/art/stills/${slug}?from=6`);

    expect(page.status).toBe(200);
    expect(page.body).toEqual({
      status: 'ready',
      stills: { '2': '/e2.jpg', '3': '/e3.jpg' },
    });
    expect(past.body).toEqual({ status: 'ready', stills: {} });
  });

  it('rejects a page longer than 100', async () => {
    const { http } = await buildApp();

    const res = await http().get('/v1/art/stills/one-piece?limit=101');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
  });
});
