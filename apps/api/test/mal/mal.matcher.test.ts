import { describe, expect, it } from 'vitest';
import type { MalCandidate } from '../../src/mal/mal.client.ts';
import { matchMal } from '../../src/mal/mal.matcher.ts';

// The matcher reads the titles, the year, the episode count and the media type. Each test sets the ones it is about.
const show: MalCandidate = {
  id: 1,
  title: 'Black Clover',
  english: undefined,
  synonyms: [],
  year: 2017,
  episodes: 170,
  mediaType: 'tv',
  score: 7.55,
  voters: 69596,
  rank: 2006,
  popularity: 1762,
  members: 157000,
  airing: 'finished_airing',
  startDate: null,
  startSeason: { year: 2017, season: 'fall' },
};

describe('matchMal', () => {
  it('takes the candidate that agrees on name, year and episodes', () => {
    const found = matchMal(
      {
        slug: 'black-clover-a1',
        name: 'Black Clover',
        year: 2017,
        episodeCount: 170,
      },
      [{ ...show, id: 9, title: 'Something Else Entirely', year: 2001 }, show],
    );

    expect(found?.candidate.id).toBe(1);
    expect(found?.score).toBe(1);
  });

  it('refuses when the best candidate is a different show', () => {
    const found = matchMal(
      {
        slug: 'black-clover-a1',
        name: 'Black Clover',
        year: 2017,
        episodeCount: 170,
      },
      [{ ...show, title: 'Naruto', year: 2002 }],
    );

    expect(found).toBeNull();
  });

  it('refuses two candidates it cannot tell apart', () => {
    const found = matchMal(
      {
        slug: 'black-clover-a1',
        name: 'Black Clover',
        year: 2017,
        episodeCount: 170,
      },
      [
        { ...show, id: 1 },
        { ...show, id: 2 },
      ],
    );

    expect(found).toBeNull();
  });

  it('picks the season the source names, whichever comes first in the results', () => {
    const seasons = [
      { ...show, id: 1, title: 'Ao no Hako', year: 2024, episodes: 25 },
      {
        ...show,
        id: 2,
        title: 'Ao no Hako 2nd Season',
        year: 2026,
        episodes: 12,
      },
    ];

    const second = matchMal(
      {
        slug: 'ao-no-hako-2nd-season-a6078',
        name: 'Ao no Hako 2nd Season',
        year: 2026,
        episodeCount: 12,
      },
      seasons,
    );
    const first = matchMal(
      {
        slug: 'ao-no-hako-a1',
        name: 'Ao no Hako',
        year: 2024,
        episodeCount: 25,
      },
      seasons.toReversed(),
    );

    expect(second?.candidate.id).toBe(2);
    expect(first?.candidate.id).toBe(1);
  });

  it('refuses a first season offered for a later one rather than guess', () => {
    const found = matchMal(
      {
        slug: 'tonikaku-kawaii-2nd-season-a4476',
        name: 'Tonikaku Kawaii 2nd Season',
        year: 2023,
        episodeCount: 12,
      },
      [{ ...show, title: 'Tonikaku Kawaii', year: 2020, episodes: 12 }],
    );

    expect(found).toBeNull();
  });

  it('reads the season from the slug when the translated name carries no marker', () => {
    const found = matchMal(
      {
        slug: 'sekai-saikou-no-ansatsusha-isekai-kizoku-ni-tensei-suru-2nd-season-a6188',
        name: 'Sát Thủ Đệ Nhất Thế Giới Chuyển Sinh Thành Quý Tộc 2',
      },
      [
        {
          ...show,
          id: 1,
          title: 'Sekai Saikou no Ansatsusha, Isekai Kizoku ni Tensei suru',
          year: 2021,
        },
        {
          ...show,
          id: 2,
          title:
            'Sekai Saikou no Ansatsusha, Isekai Kizoku ni Tensei suru Season 2',
          year: 2027,
          episodes: undefined,
        },
      ],
    );

    expect(found?.candidate.id).toBe(2);
  });

  it('takes the season over its Part 2 when the source asks for no part', () => {
    const found = matchMal(
      {
        slug: 'yozakura-san-chi-no-daisakusen-2nd-season-a5475',
        name: 'Yozakura-san Chi no Daisakusen 2nd Season',
      },
      [
        {
          ...show,
          id: 2,
          title: 'Yozakura-san Chi no Daisakusen 2nd Season Part 2',
          year: 2026,
          episodes: undefined,
        },
        {
          ...show,
          id: 1,
          title: 'Yozakura-san Chi no Daisakusen 2nd Season',
          year: 2026,
          episodes: 12,
        },
      ],
    );

    expect(found?.candidate.id).toBe(1);
  });

  it('matches a translated name through the romaji in its slug', () => {
    const found = matchMal(
      {
        slug: 'tonikaku-kawaii-a3860',
        name: 'Chỉ Cần Em Đáng Yêu',
        year: 2020,
      },
      [
        {
          ...show,
          id: 3,
          title: 'Tonikaku Kawaii',
          year: 2020,
          episodes: undefined,
        },
      ],
    );

    expect(found?.candidate.id).toBe(3);
  });

  it('matches on a synonym MAL lists for the show', () => {
    const found = matchMal(
      { slug: 'x-a1', name: 'Shingeki no Kyojin', year: 2013 },
      [
        {
          ...show,
          id: 7,
          title: 'Attack on Titan',
          english: 'Attack on Titan',
          synonyms: ['Shingeki no Kyojin'],
          year: 2013,
          episodes: undefined,
        },
      ],
    );

    expect(found?.candidate.id).toBe(7);
  });

  it('matches a Vietnamese-only title only with the English name TMDB knows it by', () => {
    const input = {
      slug: 'tham-tu-lung-danh-conan-a3',
      name: 'Thám Tử Lừng Danh Conan',
    };
    const conan = {
      ...show,
      id: 235,
      title: 'Meitantei Conan',
      english: 'Case Closed',
      year: 1996,
      episodes: undefined,
    };

    expect(matchMal(input, [conan])).toBeNull();
    expect(matchMal(input, [conan], ['Case Closed'])?.candidate.id).toBe(235);
  });

  it('matches a title whose year and episode count are unknown on both sides', () => {
    const found = matchMal({ slug: 'black-clover-a1', name: 'Black Clover' }, [
      { ...show, year: undefined, episodes: undefined },
    ]);

    expect(found?.candidate.id).toBe(1);
  });

  it('never matches a promo video, and does not let one of the same name block the show', () => {
    const input = { slug: 'black-clover-a1', name: 'Black Clover' };
    const promo = { ...show, id: 2, mediaType: 'pv' };

    expect(matchMal(input, [show, promo])?.candidate.id).toBe(1);
    expect(matchMal(input, [promo])).toBeNull();
  });
});
