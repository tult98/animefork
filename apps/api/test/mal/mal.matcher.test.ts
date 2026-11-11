import { describe, expect, it } from 'vitest';
import { matchMal, scoreCandidate } from '../../src/mal/mal.matcher.ts';
import { candidate } from './helpers.ts';

const BLACK_CLOVER = {
  slug: 'black-clover-a1',
  name: 'Black Clover',
  year: 2017,
  episodeCount: 170,
};

describe('matchMal', () => {
  it('takes the candidate that agrees on name, year and episodes', () => {
    const found = matchMal(BLACK_CLOVER, [
      candidate({ id: 9, title: 'Something Else Entirely', year: 2001 }),
      candidate({ id: 1 }),
    ]);
    expect(found?.candidate.id).toBe(1);
    expect(found?.score).toBeGreaterThan(0.95);
  });

  it('picks the later season by its marker, not the first one', () => {
    const input = {
      slug: 'ao-no-hako-2nd-season-a6078',
      name: 'Ao no Hako 2nd Season',
      year: 2026,
      episodeCount: 12,
    };
    const found = matchMal(input, [
      candidate({ id: 1, title: 'Ao no Hako', year: 2024, episodes: 25 }),
      candidate({
        id: 2,
        title: 'Ao no Hako 2nd Season',
        year: 2026,
        episodes: 12,
      }),
    ]);
    expect(found?.candidate.id).toBe(2);
  });

  it('picks the first season for a title with no marker', () => {
    const found = matchMal(
      {
        slug: 'ao-no-hako-a1',
        name: 'Ao no Hako',
        year: 2024,
        episodeCount: 25,
      },
      [
        candidate({
          id: 2,
          title: 'Ao no Hako 2nd Season',
          year: 2026,
          episodes: 12,
        }),
        candidate({ id: 1, title: 'Ao no Hako', year: 2024, episodes: 25 }),
      ],
    );
    expect(found?.candidate.id).toBe(1);
  });

  it('rejects a first season offered for a later one rather than guess', () => {
    const input = {
      slug: 'tonikaku-kawaii-2nd-season-a4476',
      name: 'Tonikaku Kawaii 2nd Season',
      year: 2023,
      episodeCount: 12,
    };
    expect(
      matchMal(input, [
        candidate({
          id: 1,
          title: 'Tonikaku Kawaii',
          year: 2020,
          episodes: 12,
        }),
      ]),
    ).toBeNull();
  });

  it('matches on the english title or a synonym', () => {
    const input = { slug: 'x-a1', name: 'Shingeki no Kyojin', year: 2013 };
    const found = matchMal(input, [
      candidate({
        id: 7,
        title: 'Attack on Titan',
        english: 'Attack on Titan',
        synonyms: ['Shingeki no Kyojin'],
        year: 2013,
        episodes: undefined,
      }),
    ]);
    expect(found?.candidate.id).toBe(7);
  });

  it('uses the romaji in the slug when the display name is in another language', () => {
    const found = matchMal(
      {
        slug: 'tonikaku-kawaii-a3860',
        name: 'Chỉ Cần Em Đáng Yêu',
        year: 2020,
      },
      [
        candidate({
          id: 3,
          title: 'Tonikaku Kawaii',
          year: 2020,
          episodes: undefined,
        }),
      ],
    );
    expect(found?.candidate.id).toBe(3);
  });

  it('refuses two near-identical candidates it cannot tell apart', () => {
    const twin = { title: 'Black Clover', year: 2017, episodes: 170 };
    expect(
      matchMal(BLACK_CLOVER, [
        candidate({ id: 1, ...twin }),
        candidate({ id: 2, ...twin }),
      ]),
    ).toBeNull();
  });

  it('refuses when the best candidate is a different show', () => {
    expect(
      matchMal(BLACK_CLOVER, [
        candidate({ id: 5, title: 'Naruto', year: 2002 }),
      ]),
    ).toBeNull();
    expect(matchMal(BLACK_CLOVER, [])).toBeNull();
  });

  it('ranks a tv series above a movie of the same name', () => {
    const tv = candidate({ id: 1, mediaType: 'tv' });
    const movie = candidate({ id: 2, mediaType: 'movie' });
    expect(scoreCandidate(BLACK_CLOVER, tv)).toBeGreaterThan(
      scoreCandidate(BLACK_CLOVER, movie),
    );
  });

  it('treats an unknown year or episode count as neutral, not as a mismatch', () => {
    const found = matchMal({ slug: 'black-clover-a1', name: 'Black Clover' }, [
      candidate({ year: undefined, episodes: undefined }),
    ]);
    expect(found).not.toBeNull();
  });

  it.each(['pv', 'cm', 'music'])(
    'never matches a %s entry, even a closer one than the show',
    (mediaType) => {
      const show = candidate({ id: 1, year: 2026, episodes: undefined });
      const promo = candidate({
        id: 2,
        mediaType,
        year: 2026,
        episodes: undefined,
      });
      const input = { slug: 'black-clover-a1', name: 'Black Clover' };
      expect(matchMal(input, [show, promo])?.candidate.id).toBe(1);
      expect(matchMal(input, [promo])).toBeNull();
    },
  );

  it('still matches when a promo trails the show by less than the margin', () => {
    const input = { slug: 'seitokai-a1', name: 'Seitokai ni mo Ana wa Aru!' };
    const found = matchMal(input, [
      candidate({
        id: 61578,
        title: 'Seitokai ni mo Ana wa Aru!',
        year: 2026,
        episodes: undefined,
      }),
      candidate({
        id: 59276,
        title: 'Seitokai ni mo Ana wa Aru! PV',
        mediaType: 'pv',
        year: 2024,
        episodes: undefined,
      }),
    ]);
    expect(found?.candidate.id).toBe(61578);
  });
});

describe('matchMal on translated names and split seasons', () => {
  it('reads the season from the slug when the translated name has no marker', () => {
    const found = matchMal(
      {
        slug: 'sekai-saikou-no-ansatsusha-isekai-kizoku-ni-tensei-suru-2nd-season-a6188',
        name: 'Sát Thủ Đệ Nhất Thế Giới Chuyển Sinh Thành Quý Tộc 2',
      },
      [
        candidate({
          id: 1,
          title: 'Sekai Saikou no Ansatsusha, Isekai Kizoku ni Tensei suru',
          year: 2021,
        }),
        candidate({
          id: 2,
          title:
            'Sekai Saikou no Ansatsusha, Isekai Kizoku ni Tensei suru Season 2',
          year: 2027,
          episodes: undefined,
        }),
      ],
    );
    expect(found?.candidate.id).toBe(2);
  });

  it('takes the season over its Part 2 when the source asks for no part', () => {
    const input = {
      slug: 'yozakura-san-chi-no-daisakusen-2nd-season-a5475',
      name: 'Yozakura-san Chi no Daisakusen 2nd Season',
    };
    const found = matchMal(input, [
      candidate({
        id: 2,
        title: 'Yozakura-san Chi no Daisakusen 2nd Season Part 2',
        year: 2026,
        episodes: undefined,
      }),
      candidate({
        id: 1,
        title: 'Yozakura-san Chi no Daisakusen 2nd Season',
        year: 2026,
        episodes: 12,
      }),
    ]);
    expect(found?.candidate.id).toBe(1);
  });
});

describe('matchMal with aliases', () => {
  it('matches a Vietnamese-only title through the English name TMDB knows', () => {
    const input = {
      slug: 'tham-tu-lung-danh-conan-a3',
      name: 'Thám Tử Lừng Danh Conan',
    };
    const detective = candidate({
      id: 235,
      title: 'Meitantei Conan',
      english: 'Case Closed',
      year: 1996,
      episodes: undefined,
    });
    expect(matchMal(input, [detective])).toBeNull();
    expect(matchMal(input, [detective], ['Case Closed'])?.candidate.id).toBe(
      235,
    );
  });
});
