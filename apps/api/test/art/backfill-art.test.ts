import { randomInt } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { ART_SYNC, ArtFiller } from '../../src/art/art.filler.ts';
import { ART_STORE, type ArtStore } from '../../src/art/art.store.ts';
import { backfillArt } from '../../src/scripts/backfill-art.ts';
import { buildApp } from '../test-app.ts';
import { mockTmdbImages, mockTmdbShow } from './__mockData__/index.ts';

describe('backfill-art', () => {
  it('reports the movie a dry run would match a movie to, and leaves its stored TV series art alone', async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const slug = `naruto-movie-huyen-thoai-da-gelel-a${randomInt(1_000_000_000)}`;
    const store = app.get<ArtStore>(ART_STORE);
    await store.saveMatched({
      title: {
        source_slug: slug,
        tmdb_kind: 'tv',
        tmdb_id: 46260,
        tmdb_season: null,
        match_scope: 'show',
        backdrop_path: '/naruto-series.jpg',
        backdrop_lang: 'en',
        poster_path: null,
        poster_lang: null,
        source_name: 'Naruto: Huyền Thoại Đá Gelel',
        source_year: 2005,
        source_episode_count: null,
        matched_by: 'jev',
      },
      episodes: [],
    });
    await store.saveOverview(slug, 'tv', 46260, {
      status: 'ok',
      text: 'Naruto muốn trở thành Hokage.',
      lang: 'vi',
      translated: false,
    });
    fetchMock
      .get('https://tmdb.test/3/search/movie?api_key=key&query=Naruto', {
        results: [
          {
            id: 16910,
            title: 'Naruto the Movie: Legend of the Stone of Gelel',
            original_title: '劇場版 NARUTO 大激突!幻の地底遺跡だってばよ',
            genre_ids: [16],
          },
        ],
      })
      .get('begin:https://tmdb.test/3/search/', { results: [] })
      .get('https://tmdb.test/3/movie/16910?api_key=key', {
        id: 16910,
        title: 'Naruto the Movie: Legend of the Stone of Gelel',
        original_title: '劇場版 NARUTO 大激突!幻の地底遺跡だってばよ',
        release_date: '2005-08-06',
      })
      .get('https://tmdb.test/3/movie/16910/alternative_titles?api_key=key', {
        titles: [],
      })
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: 'movie:16910',
            confidence: 0.8,
            probabilities: { 'movie:16910': 0.93 },
          },
          any_match: { type: 'noul', noul: 0.92 },
          show_match: {
            type: 'choice',
            choice: 'movie:16910',
            confidence: 0.8,
            probabilities: { 'movie:16910': 0.93 },
          },
          any_show: { type: 'noul', noul: 0.92 },
          side_entry: { type: 'noul', noul: 0.97 },
        },
        usage: { input_tokens: 400, output_tokens: 30 },
      })
      .get(
        'https://tmdb.test/3/movie/16910/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      );
    const lines: string[] = [];

    const summary = await backfillArt(
      [
        {
          source_slug: slug,
          source_name: 'Naruto: Huyền Thoại Đá Gelel',
          source_year: 2005,
          source_episode_count: null,
          other_names: null,
          tmdb_kind: 'tv',
          tmdb_id: 46260,
          match_scope: 'show',
        },
      ],
      {
        sync: app.get(ART_SYNC),
        store,
        filler: app.get(ArtFiller),
        write: false,
        log: (line) => lines.push(line),
      },
    );

    expect(summary).toEqual({
      lookedAt: 1,
      kept: 0,
      rematched: 1,
      cleared: 0,
      failed: 0,
    });
    expect(lines).toEqual([
      `rematched ${slug} tv:46260/show -> movie:16910/show`,
    ]);
    const res = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Naruto: Huyền Thoại Đá Gelel' }] });
    expect(res.body.art[slug]).toEqual({
      status: 'ready',
      backdropPath: '/naruto-series.jpg',
      backdropLang: 'en',
      posterPath: null,
      overview: 'Naruto muốn trở thành Hokage.',
      overviewTranslated: false,
    });
    expect(fetchMock).not.toHaveFetched(
      'https://tmdb.test/3/movie/16910?api_key=key&language=vi',
    );
  });

  it('with --write moves a movie onto its own TMDB movie and its overview, and clears a movie whose own TMDB movie Jev turns down', async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const run = randomInt(1_000_000_000);
    const gelel = `naruto-movie-huyen-thoai-da-gelel-a${run}`;
    const nobody = `nobody-knows-movie-a${run}`;
    const store = app.get<ArtStore>(ART_STORE);
    const wrongMatch = {
      tmdb_kind: 'tv' as const,
      tmdb_season: null,
      match_scope: 'show' as const,
      backdrop_path: '/series.jpg',
      backdrop_lang: 'en',
      poster_path: null,
      poster_lang: null,
      source_year: 2005,
      source_episode_count: null,
      matched_by: 'jev' as const,
    };
    await store.saveMatched({
      title: {
        ...wrongMatch,
        source_slug: gelel,
        tmdb_id: 46260,
        source_name: 'Naruto: Huyền Thoại Đá Gelel',
      },
      episodes: [],
    });
    await store.saveMatched({
      title: {
        ...wrongMatch,
        source_slug: nobody,
        tmdb_id: 30983,
        source_name: 'Nobody Knows Movie',
      },
      episodes: [],
    });
    fetchMock
      .get('https://tmdb.test/3/search/movie?api_key=key&query=Naruto', {
        results: [
          {
            id: 16910,
            title: 'Naruto the Movie: Legend of the Stone of Gelel',
            original_title: '劇場版 NARUTO 大激突!幻の地底遺跡だってばよ',
            genre_ids: [16],
          },
        ],
      })
      .get(
        'https://tmdb.test/3/search/movie?api_key=key&query=Nobody+Knows+Movie',
        {
          results: [
            {
              id: 501,
              title: 'Nobody Knows',
              original_title: '誰も知らない',
              genre_ids: [16],
            },
          ],
        },
      )
      .get('begin:https://tmdb.test/3/search/', { results: [] })
      .get('https://tmdb.test/3/movie/16910?api_key=key', {
        id: 16910,
        title: 'Naruto the Movie: Legend of the Stone of Gelel',
        original_title: '劇場版 NARUTO 大激突!幻の地底遺跡だってばよ',
        release_date: '2005-08-06',
      })
      .get('https://tmdb.test/3/movie/16910/alternative_titles?api_key=key', {
        titles: [],
      })
      .get('https://tmdb.test/3/movie/501?api_key=key', {
        id: 501,
        title: 'Nobody Knows',
        original_title: '誰も知らない',
        release_date: '2004-08-07',
      })
      .get('https://tmdb.test/3/movie/501/alternative_titles?api_key=key', {
        titles: [],
      })
      .post(
        'https://api.typesafe.ai/v1/systemone',
        {
          model: 'jev-1.13.0',
          answers: {
            match: {
              type: 'choice',
              choice: 'movie:16910',
              confidence: 0.8,
              probabilities: { 'movie:16910': 0.93 },
            },
            any_match: { type: 'noul', noul: 0.92 },
            show_match: {
              type: 'choice',
              choice: 'movie:16910',
              confidence: 0.8,
              probabilities: { 'movie:16910': 0.93 },
            },
            any_show: { type: 'noul', noul: 0.92 },
            side_entry: { type: 'noul', noul: 0.97 },
          },
          usage: { input_tokens: 400, output_tokens: 30 },
        },
        { repeat: 1 },
      )
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: 'movie:501',
            confidence: 0.6,
            probabilities: { 'movie:501': 0.3 },
          },
          any_match: { type: 'noul', noul: 0.2 },
          show_match: {
            type: 'choice',
            choice: 'movie:501',
            confidence: 0.6,
            probabilities: { 'movie:501': 0.3 },
          },
          any_show: { type: 'noul', noul: 0.2 },
          side_entry: { type: 'noul', noul: 0.95 },
        },
        usage: { input_tokens: 400, output_tokens: 30 },
      })
      .get(
        'https://tmdb.test/3/movie/16910/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/movie/16910?api_key=key&language=vi', {
        id: 16910,
        title: 'Naruto the Movie: Legend of the Stone of Gelel',
        original_title: '劇場版 NARUTO 大激突!幻の地底遺跡だってばよ',
        overview: 'Naruto bảo vệ viên đá Gelel.',
      });
    const lines: string[] = [];

    const summary = await backfillArt(
      [
        {
          source_slug: gelel,
          source_name: 'Naruto: Huyền Thoại Đá Gelel',
          source_year: 2005,
          source_episode_count: null,
          other_names: null,
          tmdb_kind: 'tv',
          tmdb_id: 46260,
          match_scope: 'show',
        },
        {
          source_slug: nobody,
          source_name: 'Nobody Knows Movie',
          source_year: 2005,
          source_episode_count: null,
          other_names: null,
          tmdb_kind: 'tv',
          tmdb_id: 30983,
          match_scope: 'show',
        },
      ],
      {
        sync: app.get(ART_SYNC),
        store,
        filler: app.get(ArtFiller),
        write: true,
        log: (line) => lines.push(line),
      },
    );

    expect(summary).toEqual({
      lookedAt: 2,
      kept: 0,
      rematched: 1,
      cleared: 1,
      failed: 0,
    });
    expect(lines).toEqual([
      `rematched ${gelel} tv:46260/show -> movie:16910/show`,
      `cleared ${nobody} tv:30983/show -> no_match no confident match by jev (best probability 0.20, show probability 0.20) via query 'nobody knows movie'`,
    ]);
    const res = await http()
      .post('/v1/art/lookup')
      .send({
        titles: [
          { slug: gelel, name: 'Naruto: Huyền Thoại Đá Gelel' },
          { slug: nobody, name: 'Nobody Knows Movie' },
        ],
      });
    expect(res.body.art).toEqual({
      [gelel]: {
        status: 'ready',
        backdropPath: '/backdrop-en.jpg',
        backdropLang: 'en',
        posterPath: '/poster-vi.jpg',
        overview: 'Naruto bảo vệ viên đá Gelel.',
        overviewTranslated: false,
      },
      [nobody]: { status: 'none' },
    });
  });

  it('with --write keeps a TV season whose new answer only changes scope or is turned down', async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const run = randomInt(1_000_000_000);
    const conan = `tham-tu-lung-danh-conan-a${run}`;
    const tonikaku = `tom-lai-em-rat-de-thuong-a${run}`;
    const store = app.get<ArtStore>(ART_STORE);
    const seasonMatch = {
      tmdb_kind: 'tv' as const,
      tmdb_season: 1,
      match_scope: 'season' as const,
      backdrop_lang: 'en',
      poster_lang: null,
      matched_by: 'jev' as const,
    };
    await store.saveMatched({
      title: {
        ...seasonMatch,
        source_slug: conan,
        tmdb_id: 30983,
        backdrop_path: '/conan.jpg',
        poster_path: null,
        source_name: 'Thám Tử Lừng Danh Conan',
        source_year: 1996,
        source_episode_count: 1100,
      },
      episodes: [
        { source_slug: conan, episode_number: 1, still_path: '/conan-e1.jpg' },
      ],
    });
    await store.saveMatched({
      title: {
        ...seasonMatch,
        source_slug: tonikaku,
        tmdb_id: 100,
        backdrop_path: '/tonikaku.jpg',
        poster_path: null,
        source_name: 'Tóm Lại Em Rất Dễ Thương',
        source_year: 2020,
        source_episode_count: 12,
      },
      episodes: [],
    });
    await store.saveOverview(conan, 'tv', 30983, {
      status: 'ok',
      text: 'Shinichi bị teo nhỏ thành Conan.',
      lang: 'vi',
      translated: false,
    });
    await store.saveOverview(tonikaku, 'tv', 100, {
      status: 'ok',
      text: 'Nasa cầu hôn Tsukasa.',
      lang: 'vi',
      translated: false,
    });
    fetchMock
      .get(
        'https://tmdb.test/3/search/tv?api_key=key&query=Thám+Tử+Lừng+Danh+Conan',
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
      .get('https://tmdb.test/3/tv/30983?api_key=key', {
        id: 30983,
        name: 'Detective Conan',
        original_name: '名探偵コナン',
        number_of_episodes: 1100,
        first_air_date: '1996-01-08',
        seasons: [
          { season_number: 1, episode_count: 1100, air_date: '1996-01-08' },
        ],
      })
      .get('https://tmdb.test/3/tv/30983/alternative_titles?api_key=key', {
        results: [],
      })
      .get(
        'https://tmdb.test/3/tv/30983/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/100?api_key=key', mockTmdbShow)
      .get('https://tmdb.test/3/tv/100/alternative_titles?api_key=key', {
        results: [],
      })
      .post(
        'https://api.typesafe.ai/v1/systemone',
        {
          model: 'jev-1.13.0',
          answers: {
            match: {
              type: 'choice',
              choice: 'tv:30983',
              confidence: 0.8,
              probabilities: { 'tv:30983': 0.92 },
            },
            any_match: { type: 'noul', noul: 0.3 },
            show_match: {
              type: 'choice',
              choice: 'tv:30983',
              confidence: 0.8,
              probabilities: { 'tv:30983': 0.92 },
            },
            any_show: { type: 'noul', noul: 0.96 },
            side_entry: { type: 'noul', noul: 0.05 },
          },
          usage: { input_tokens: 400, output_tokens: 30 },
        },
        { repeat: 1 },
      )
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: 'tv:100',
            confidence: 0.6,
            probabilities: { 'tv:100': 0.6 },
          },
          any_match: { type: 'noul', noul: 0.5 },
          show_match: {
            type: 'choice',
            choice: 'tv:100',
            confidence: 0.6,
            probabilities: { 'tv:100': 0.6 },
          },
          any_show: { type: 'noul', noul: 0.5 },
          side_entry: { type: 'noul', noul: 0.05 },
        },
        usage: { input_tokens: 400, output_tokens: 30 },
      });
    const lines: string[] = [];

    const summary = await backfillArt(
      [
        {
          source_slug: conan,
          source_name: 'Thám Tử Lừng Danh Conan',
          source_year: 1996,
          source_episode_count: 1100,
          other_names: null,
          tmdb_kind: 'tv',
          tmdb_id: 30983,
          match_scope: 'season',
        },
        {
          source_slug: tonikaku,
          source_name: 'Tóm Lại Em Rất Dễ Thương',
          source_year: 2020,
          source_episode_count: 12,
          other_names: null,
          tmdb_kind: 'tv',
          tmdb_id: 100,
          match_scope: 'season',
        },
      ],
      {
        sync: app.get(ART_SYNC),
        store,
        filler: app.get(ArtFiller),
        write: true,
        log: (line) => lines.push(line),
      },
    );

    expect(summary).toEqual({
      lookedAt: 2,
      kept: 2,
      rematched: 0,
      cleared: 0,
      failed: 0,
    });
    expect(lines).toEqual([
      `kept ${conan} tv:30983/season -> tv:30983/show`,
      `kept ${tonikaku} tv:100/season -> no_match no confident match by jev (best probability 0.50, show probability 0.50) via query 'Tóm Lại Em Rất Dễ Thương'`,
    ]);
    const res = await http()
      .post('/v1/art/lookup')
      .send({
        titles: [
          { slug: conan, name: 'Thám Tử Lừng Danh Conan' },
          { slug: tonikaku, name: 'Tóm Lại Em Rất Dễ Thương' },
        ],
      });
    expect(res.body.art).toEqual({
      [conan]: {
        status: 'ready',
        backdropPath: '/conan.jpg',
        backdropLang: 'en',
        posterPath: null,
        overview: 'Shinichi bị teo nhỏ thành Conan.',
        overviewTranslated: false,
      },
      [tonikaku]: {
        status: 'ready',
        backdropPath: '/tonikaku.jpg',
        backdropLang: 'en',
        posterPath: null,
        overview: 'Nasa cầu hôn Tsukasa.',
        overviewTranslated: false,
      },
    });
    const stills = await http().get(`/v1/art/stills/${conan}`);
    expect(stills.body).toEqual({
      status: 'ready',
      stills: { 1: '/conan-e1.jpg' },
    });
  });

  it('with --write clears a movie stored against a TV series that first aired years after it', async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        TYPESAFE_API_KEY: 'jev-key',
      },
    });
    const slug = `boruto-dua-con-ngo-nghich-cua-naruto-a${randomInt(1_000_000_000)}`;
    const store = app.get<ArtStore>(ART_STORE);
    await store.saveMatched({
      title: {
        source_slug: slug,
        tmdb_kind: 'tv',
        tmdb_id: 70881,
        tmdb_season: null,
        match_scope: 'show',
        backdrop_path: '/boruto-series.jpg',
        backdrop_lang: 'en',
        poster_path: null,
        poster_lang: null,
        source_name: 'Boruto: Đứa Con Ngỗ Nghịch Của Naruto',
        source_year: 2015,
        source_episode_count: null,
        matched_by: 'jev',
      },
      episodes: [],
    });
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Boruto', {
        results: [
          {
            id: 70881,
            name: 'Boruto: Naruto Next Generations',
            original_name: 'BORUTO-ボルト- NARUTO NEXT GENERATIONS',
          },
        ],
      })
      .get('begin:https://tmdb.test/3/search/', { results: [] })
      .get('https://tmdb.test/3/tv/70881?api_key=key', {
        id: 70881,
        name: 'Boruto: Naruto Next Generations',
        original_name: 'BORUTO-ボルト- NARUTO NEXT GENERATIONS',
        number_of_episodes: 293,
        first_air_date: '2017-04-05',
        seasons: [
          { season_number: 1, episode_count: 293, air_date: '2017-04-05' },
        ],
      })
      .get('https://tmdb.test/3/tv/70881/alternative_titles?api_key=key', {
        results: [],
      })
      .post('https://api.typesafe.ai/v1/systemone', {
        model: 'jev-1.13.0',
        answers: {
          match: {
            type: 'choice',
            choice: 'tv:70881',
            confidence: 0.6,
            probabilities: { 'tv:70881': 0.56 },
          },
          any_match: { type: 'noul', noul: 0.4 },
          show_match: {
            type: 'choice',
            choice: 'tv:70881',
            confidence: 0.9,
            probabilities: { 'tv:70881': 0.95 },
          },
          any_show: { type: 'noul', noul: 0.9 },
          side_entry: { type: 'noul', noul: 0.4 },
        },
        usage: { input_tokens: 400, output_tokens: 30 },
      });
    const lines: string[] = [];

    const summary = await backfillArt(
      [
        {
          source_slug: slug,
          source_name: 'Boruto: Đứa Con Ngỗ Nghịch Của Naruto',
          source_year: 2015,
          source_episode_count: null,
          other_names: null,
          tmdb_kind: 'tv',
          tmdb_id: 70881,
          match_scope: 'show',
        },
      ],
      {
        sync: app.get(ART_SYNC),
        store,
        filler: app.get(ArtFiller),
        write: true,
        log: (line) => lines.push(line),
      },
    );

    expect(summary).toEqual({
      lookedAt: 1,
      kept: 0,
      rematched: 0,
      cleared: 1,
      failed: 0,
    });
    expect(lines).toEqual([
      `cleared ${slug} tv:70881/show -> no_match no confident match by jev (best probability 0.40, show probability 0.90) via query 'Boruto'`,
    ]);
    const res = await http()
      .post('/v1/art/lookup')
      .send({
        titles: [{ slug, name: 'Boruto: Đứa Con Ngỗ Nghịch Của Naruto' }],
      });
    expect(res.body.art).toEqual({ [slug]: { status: 'none' } });
  });
});
