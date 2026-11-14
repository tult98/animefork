import { randomInt } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { ArtFiller } from '../../src/art/art.filler.ts';
import { ART_STORE, type ArtStore } from '../../src/art/art.store.ts';
import type { MalFiller } from '../../src/mal/mal.filler.ts';
import { MAL_FILLER } from '../../src/mal/mal.module.ts';
import { MAL_STORE, type MalStore } from '../../src/mal/mal.store.ts';
import { buildApp } from '../test-app.ts';
import { mockTmdbImages } from './__mockData__/index.ts';

describe('art lookup from the MAL match', () => {
  it('gives a movie its own TMDB movie, found from its MAL names and year', async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `conan-movie-27-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({
      slug,
      status: 'ok',
      malId,
      score: 7.9,
      voters: 20000,
      rank: 900,
      popularity: 3000,
      members: 60000,
      airing: 'finished_airing',
      episodes: 1,
      startDate: '2024-04-12',
      startSeason: { year: 2024, season: 'spring' },
      trailerYoutubeId: null,
      mediaType: 'movie',
      english: 'Detective Conan: The Million-dollar Pentagram',
      synonyms: [],
      datesKnown: true,
      matchedTitle: 'Meitantei Conan: 100-man Dollar no Michishirube',
      matchScore: 0.9,
      matchedBy: 'score',
      matcherVersion: 8,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    fetchMock
      .get(
        'https://tmdb.test/3/search/movie?api_key=key&query=Detective+Conan%3A+The+Million-dollar+Pentagram',
        {
          results: [
            {
              id: 1209290,
              title: 'Detective Conan: The Million-dollar Pentagram',
              original_title: '名探偵コナン 100万ドルの五稜星',
              release_date: '2024-04-12',
              genre_ids: [16, 9648],
            },
            {
              id: 1072342,
              title: 'Detective Conan: Black Iron Submarine',
              original_title: '名探偵コナン 黒鉄の魚影',
              release_date: '2023-04-14',
              genre_ids: [16, 9648],
            },
          ],
        },
      )
      .get(
        'https://tmdb.test/3/movie/1209290/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/movie/1209290?api_key=key&language=vi', {
        id: 1209290,
        title: 'Detective Conan: The Million-dollar Pentagram',
        original_title: '名探偵コナン 100万ドルの五稜星',
        overview: 'Kaito Kid nhắm tới thanh kiếm ở Hakodate.',
      })
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);
    const title = {
      slug,
      name: 'Thám Tử Lừng Danh Conan: Ngôi Sao 5 Cánh 1 Triệu Đô',
      year: 2024,
    };

    const first = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();
    const later = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });

    expect(first.body.art).toEqual({ [slug]: { status: 'pending' } });
    expect(later.status).toBe(200);
    expect(later.body.art).toEqual({
      [slug]: {
        status: 'ready',
        backdropPath: '/backdrop-en.jpg',
        backdropLang: 'en',
        posterPath: '/poster-vi.jpg',
        overview: 'Kaito Kid nhắm tới thanh kiếm ở Hakodate.',
        overviewTranslated: false,
      },
    });
    const stored = (await app.get<ArtStore>(ART_STORE).find([slug])).get(slug);
    expect(stored).toMatchObject({
      status: 'matched',
      tmdbKind: 'movie',
      tmdbId: 1209290,
      tmdbSeason: null,
      matchScope: 'show',
      matchedBy: 'mal',
      sourceMalId: malId,
    });
    expect(fetchMock).not.toHaveFetched('begin:https://tmdb.test/3/search/tv');
  });

  it("finds a second season's show by the name without its marker, and stores the stills of the season that starts on MAL's date", async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `medalist-2nd-season-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({
      slug,
      status: 'ok',
      malId,
      score: 8.6,
      voters: 9000,
      rank: 120,
      popularity: 2500,
      members: 90000,
      airing: 'finished_airing',
      episodes: 9,
      startDate: '2026-01-24',
      startSeason: { year: 2026, season: 'winter' },
      trailerYoutubeId: null,
      mediaType: 'tv',
      english: 'Medalist Season 2',
      synonyms: [],
      datesKnown: true,
      matchedTitle: 'Medalist 2nd Season',
      matchScore: 0.95,
      matchedBy: 'score',
      matcherVersion: 8,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Medalist', {
        results: [
          {
            id: 245000,
            name: 'Medalist',
            original_name: 'メダリスト',
            first_air_date: '2025-01-05',
            genre_ids: [16, 18],
          },
        ],
      })
      .get('https://tmdb.test/3/tv/245000?api_key=key', {
        id: 245000,
        name: 'Medalist',
        original_name: 'メダリスト',
        number_of_episodes: 23,
        first_air_date: '2025-01-05',
        seasons: [
          { season_number: 1, episode_count: 13, air_date: '2025-01-05' },
          { season_number: 2, episode_count: 10, air_date: '2026-01-17' },
        ],
      })
      .get('https://tmdb.test/3/tv/245000/season/2?api_key=key', {
        episodes: [
          {
            episode_number: 1,
            air_date: '2026-01-17',
            still_path: '/recap.jpg',
          },
          {
            episode_number: 2,
            air_date: '2026-01-24',
            still_path: '/s2e1.jpg',
          },
          {
            episode_number: 3,
            air_date: '2026-01-31',
            still_path: '/s2e2.jpg',
          },
        ],
      })
      .get(
        'https://tmdb.test/3/tv/245000/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/245000?api_key=key&language=vi', {
        id: 245000,
        name: 'Medalist',
        original_name: 'メダリスト',
        number_of_episodes: 23,
        overview: 'Inori theo đuổi giấc mơ trượt băng.',
      })
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);
    const title = { slug, name: 'Huấn Luyện Viên Băng Giá Mùa 2' };

    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();
    const stills = await http().get(`/v1/art/stills/${slug}`);

    expect(stills.status).toBe(200);
    expect(stills.body).toEqual({
      status: 'ready',
      stills: { '1': '/s2e1.jpg', '2': '/s2e2.jpg' },
    });
    const stored = (await app.get<ArtStore>(ART_STORE).find([slug])).get(slug);
    expect(stored).toMatchObject({
      tmdbKind: 'tv',
      tmdbId: 245000,
      tmdbSeason: 2,
      matchScope: 'season',
      matchedBy: 'mal',
    });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      'begin:https://tmdb.test/3/search/',
    );
  });

  it('gives a remake the new show rather than the older series of the same name', async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `catseye-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({
      slug,
      status: 'ok',
      malId,
      score: 7.1,
      voters: 5000,
      rank: 3000,
      popularity: 5000,
      members: 30000,
      airing: 'finished_airing',
      episodes: 12,
      startDate: '2025-09-26',
      startSeason: { year: 2025, season: 'fall' },
      trailerYoutubeId: null,
      mediaType: 'ona',
      english: "Cat's Eye",
      synonyms: [],
      datesKnown: true,
      matchedTitle: "Cat's♥Eye",
      matchScore: 0.9,
      matchedBy: 'score',
      matcherVersion: 8,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    fetchMock
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Cat%27s+Eye', {
        results: [
          {
            id: 34114,
            name: "Cat's Eye",
            original_name: 'キャッツ・アイ',
            first_air_date: '1983-07-11',
            genre_ids: [16, 80],
          },
          {
            id: 286691,
            name: "Cat's Eye",
            original_name: 'キャッツ♥アイ',
            first_air_date: '2025-09-26',
            genre_ids: [16, 80],
          },
        ],
      })
      .get('https://tmdb.test/3/tv/286691?api_key=key', {
        id: 286691,
        name: "Cat's Eye",
        original_name: 'キャッツ♥アイ',
        number_of_episodes: 12,
        first_air_date: '2025-09-26',
        seasons: [
          { season_number: 1, episode_count: 12, air_date: '2025-09-26' },
        ],
      })
      .get('https://tmdb.test/3/tv/286691/season/1?api_key=key', {
        episodes: [
          { episode_number: 1, air_date: '2025-09-26', still_path: '/e1.jpg' },
        ],
      })
      .get(
        'https://tmdb.test/3/tv/286691/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/286691?api_key=key&language=vi', {
        id: 286691,
        name: "Cat's Eye",
        original_name: 'キャッツ♥アイ',
        number_of_episodes: 12,
        overview: 'Ba chị em Kisugi là siêu trộm.',
      })
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);

    await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: "Cat's♥Eye" }] });
    await app.get(ArtFiller).idle();

    const stored = (await app.get<ArtStore>(ART_STORE).find([slug])).get(slug);
    expect(stored).toMatchObject({
      tmdbKind: 'tv',
      tmdbId: 286691,
      tmdbSeason: 1,
      matchScope: 'season',
      matchedBy: 'mal',
    });
    expect(fetchMock).not.toHaveFetched('begin:https://tmdb.test/3/tv/34114');
  });

  it("gives a special TMDB has no movie for no art, never its franchise's series", async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `boku-no-hero-academia-more-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<MalStore>(MAL_STORE).save({
      slug,
      status: 'ok',
      malId,
      score: 7.5,
      voters: 3000,
      rank: 2500,
      popularity: 6000,
      members: 25000,
      airing: 'finished_airing',
      episodes: 1,
      startDate: '2026-05-02',
      startSeason: { year: 2026, season: 'spring' },
      trailerYoutubeId: null,
      mediaType: 'tv_special',
      english: 'My Hero Academia: More',
      synonyms: [],
      datesKnown: true,
      matchedTitle: 'Boku no Hero Academia: More',
      matchScore: 0.9,
      matchedBy: 'score',
      matcherVersion: 8,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    fetchMock
      .get('begin:https://tmdb.test/3/search/movie', {
        results: [
          {
            id: 592350,
            title: 'My Hero Academia: Heroes Rising',
            original_title:
              '僕のヒーローアカデミア THE MOVIE ヒーローズ:ライジング',
            release_date: '2019-12-20',
            genre_ids: [16, 28],
          },
        ],
      })
      .get('https://tmdb.test/3/movie/592350?api_key=key', {
        id: 592350,
        title: 'My Hero Academia: Heroes Rising',
        original_title:
          '僕のヒーローアカデミア THE MOVIE ヒーローズ:ライジング',
        release_date: '2019-12-20',
      })
      .get('https://tmdb.test/3/movie/592350/alternative_titles?api_key=key', {
        titles: [],
      })
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);
    const title = { slug, name: 'My Hero Academia' };

    await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();
    const later = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });

    expect(later.body.art).toEqual({ [slug]: { status: 'none' } });
    const stored = (await app.get<ArtStore>(ART_STORE).find([slug])).get(slug);
    expect(stored).toMatchObject({ status: 'no_match', tmdbId: null });
    expect(fetchMock).not.toHaveFetched('begin:https://tmdb.test/3/search/tv');
  });

  it('answers pending without searching TMDB while the MAL match is pending, and fills the art from it on the next lookup', async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
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
          {
            node: {
              id: malId,
              title: 'Black Clover',
              alternative_titles: { synonyms: [], en: 'Black Clover' },
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
        ],
      })
      .get(`https://tenrai.test/v1/anime/${malId}/full`, 404)
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404)
      .get('https://tmdb.test/3/search/tv?api_key=key&query=Black+Clover', {
        results: [
          {
            id: 73223,
            name: 'Black Clover',
            original_name: 'ブラッククローバー',
            first_air_date: '2017-10-03',
            genre_ids: [16],
          },
        ],
      })
      .get('https://tmdb.test/3/tv/73223?api_key=key', {
        id: 73223,
        name: 'Black Clover',
        original_name: 'ブラッククローバー',
        number_of_episodes: 170,
        first_air_date: '2017-10-03',
        seasons: [
          { season_number: 1, episode_count: 170, air_date: '2017-10-03' },
        ],
      })
      .get('https://tmdb.test/3/tv/73223/season/1?api_key=key', {
        episodes: [
          { episode_number: 1, air_date: '2017-10-03', still_path: '/bc1.jpg' },
        ],
      })
      .get(
        'https://tmdb.test/3/tv/73223/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/73223?api_key=key&language=vi', {
        id: 73223,
        name: 'Black Clover',
        original_name: 'ブラッククローバー',
        number_of_episodes: 170,
        overview: 'Asta muốn trở thành Ma pháp vương.',
      });
    const title = { slug, name: 'Black Clover', year: 2017, episodeCount: 170 };

    const first = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get<MalFiller>(MAL_FILLER).idle();
    await app.get(ArtFiller).idle();
    const second = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();
    const third = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });

    expect(first.body.art).toEqual({ [slug]: { status: 'pending' } });
    expect(second.body.art).toEqual({ [slug]: { status: 'pending' } });
    expect(third.body.art).toEqual({
      [slug]: {
        status: 'ready',
        backdropPath: '/backdrop-en.jpg',
        backdropLang: 'en',
        posterPath: '/poster-vi.jpg',
        overview: 'Asta muốn trở thành Ma pháp vương.',
        overviewTranslated: false,
      },
    });
    const stored = (await app.get<ArtStore>(ART_STORE).find([slug])).get(slug);
    expect(stored).toMatchObject({ matchedBy: 'mal', sourceMalId: malId });
    expect(fetchMock).toHaveFetchedTimes(
      1,
      'https://tmdb.test/3/search/tv?api_key=key&query=Black+Clover',
    );
    expect(fetchMock).not.toHaveFetched(
      'begin:https://tmdb.test/3/search/movie',
    );
  });

  it("serves the stored art of a title whose MAL match changed, and replaces it with the new match's record", async () => {
    const { app, http } = await buildApp({
      env: {
        TMDB_API_BASE: 'https://tmdb.test/3',
        MAL_CLIENT_ID: 'abc',
        MAL_API_BASE: 'https://mal.test/v2',
        TENRAI_API_BASE: 'https://tenrai.test/v1',
      },
    });
    const slug = `railgun-a${randomInt(1_000_000_000)}`;
    const malId = randomInt(1, 2_000_000_000);
    await app.get<ArtStore>(ART_STORE).saveMatched({
      title: {
        source_slug: slug,
        tmdb_kind: 'tv',
        tmdb_id: 30977,
        tmdb_season: null,
        match_scope: 'show',
        backdrop_path: '/index.jpg',
        backdrop_lang: 'en',
        poster_path: null,
        poster_lang: null,
        source_name: 'Railgun',
        source_year: 2009,
        source_episode_count: 24,
        matched_by: 'mal',
        source_mal_id: malId + 1,
      },
      episodes: [],
    });
    await app.get<MalStore>(MAL_STORE).save({
      slug,
      status: 'ok',
      malId,
      score: 7.6,
      voters: 300000,
      rank: 1500,
      popularity: 300,
      members: 900000,
      airing: 'finished_airing',
      episodes: 24,
      startDate: '2009-10-03',
      startSeason: { year: 2009, season: 'fall' },
      trailerYoutubeId: null,
      mediaType: 'tv',
      english: 'A Certain Scientific Railgun',
      synonyms: [],
      datesKnown: true,
      matchedTitle: 'Toaru Kagaku no Railgun',
      matchScore: 0.9,
      matchedBy: 'score',
      matcherVersion: 8,
      reason: null,
      attemptedAt: new Date('2026-03-01T00:00:00Z'),
      fetchedAt: new Date('2026-03-01T00:00:00Z'),
    });
    fetchMock
      .get(
        'https://tmdb.test/3/search/tv?api_key=key&query=A+Certain+Scientific+Railgun',
        {
          results: [
            {
              id: 30979,
              name: 'A Certain Scientific Railgun',
              original_name: 'とある科学の超電磁砲',
              first_air_date: '2009-10-03',
              genre_ids: [16],
            },
          ],
        },
      )
      .get('https://tmdb.test/3/tv/30979?api_key=key', {
        id: 30979,
        name: 'A Certain Scientific Railgun',
        original_name: 'とある科学の超電磁砲',
        number_of_episodes: 24,
        first_air_date: '2009-10-03',
        seasons: [
          { season_number: 1, episode_count: 24, air_date: '2009-10-03' },
        ],
      })
      .get('https://tmdb.test/3/tv/30979/season/1?api_key=key', {
        episodes: [
          { episode_number: 1, air_date: '2009-10-03', still_path: '/r1.jpg' },
        ],
      })
      .get(
        'https://tmdb.test/3/tv/30979/images?api_key=key&include_image_language=vi%2Cen%2Cnull',
        mockTmdbImages,
      )
      .get('https://tmdb.test/3/tv/30979?api_key=key&language=vi', {
        id: 30979,
        name: 'A Certain Scientific Railgun',
        original_name: 'とある科学の超電磁砲',
        number_of_episodes: 24,
        overview: 'Mikoto Misaka là Railgun của Thành phố Học viện.',
      })
      .get(`https://api.tenrai.org/v1/anime/${malId}/episodes?page=1`, 404);
    const title = { slug, name: 'Railgun' };

    const first = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });
    await app.get(ArtFiller).idle();
    const later = await http()
      .post('/v1/art/lookup')
      .send({ titles: [title] });

    expect(first.body.art[slug]).toMatchObject({
      status: 'ready',
      backdropPath: '/index.jpg',
    });
    expect(later.body.art[slug]).toEqual({
      status: 'ready',
      backdropPath: '/backdrop-en.jpg',
      backdropLang: 'en',
      posterPath: '/poster-vi.jpg',
      overview: 'Mikoto Misaka là Railgun của Thành phố Học viện.',
      overviewTranslated: false,
    });
    const stored = (await app.get<ArtStore>(ART_STORE).find([slug])).get(slug);
    expect(stored).toMatchObject({
      tmdbId: 30979,
      tmdbSeason: 1,
      sourceMalId: malId,
    });
  });
});
