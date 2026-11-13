import { describe, expect, it } from 'vitest';
import type { MalCandidate } from '../../src/mal/mal.client.ts';
import {
  jevCandidates,
  malJevQuestions,
  malJevState,
} from '../../src/mal/mal.jev.ts';

// The matcher and Jev read the titles, the dates, the episode count and the media type. The numbers are carried along.
const numbers = {
  score: 7.55,
  voters: 69596,
  rank: 2006,
  popularity: 1762,
  members: 157000,
};

const secondSeason: MalCandidate = {
  ...numbers,
  id: 53913,
  title: 'Tensei shitara Ken deshita II',
  english: 'Reincarnated as a Sword Season 2',
  synonyms: ['TenKen 2'],
  year: 2026,
  episodes: 12,
  mediaType: 'tv',
  airing: 'currently_airing',
  startDate: null,
  startSeason: { year: 2026, season: 'winter' },
};

const firstSeason: MalCandidate = {
  ...numbers,
  id: 52347,
  title: 'Tensei shitara Ken deshita',
  english: 'Reincarnated as a Sword',
  synonyms: ['TenKen'],
  year: 2022,
  episodes: 12,
  mediaType: 'tv',
  airing: 'finished_airing',
  startDate: '2022-10-05',
  startSeason: { year: 2022, season: 'fall' },
};

describe('what Jev is asked about a MAL match', () => {
  it('describes the source with its slug romaji and other names, and each candidate with what MAL knows of it', () => {
    const input = {
      slug: 'tensei-shitara-ken-deshita-II-a6066',
      name: 'Chuyển Sinh Thành Thanh Kiếm II',
      year: 2026,
      episodeCount: 5,
      otherNames: ['TenKen 2'],
    };

    expect(malJevState(input, [secondSeason, firstSeason])).toEqual({
      source: {
        title: 'Chuyển Sinh Thành Thanh Kiếm II',
        romaji: 'tensei shitara ken deshita II',
        otherNames: ['TenKen 2'],
        season: 1,
        year: 2026,
        episodeCount: 5,
      },
      candidates: [
        {
          id: 53913,
          title: 'Tensei shitara Ken deshita II',
          englishTitle: 'Reincarnated as a Sword Season 2',
          synonyms: ['TenKen 2'],
          year: 2026,
          episodeCount: 12,
          mediaType: 'tv',
          airingStatus: 'currently_airing',
        },
        {
          id: 52347,
          title: 'Tensei shitara Ken deshita',
          englishTitle: 'Reincarnated as a Sword',
          synonyms: ['TenKen'],
          startDate: '2022-10-05',
          episodeCount: 12,
          mediaType: 'tv',
          airingStatus: 'finished_airing',
        },
      ],
    });
    expect(malJevQuestions([secondSeason, firstSeason]).match.criteria).toEqual(
      {
        '53913':
          'Tensei shitara Ken deshita II / Reincarnated as a Sword Season 2, tv, started 2026, 12 episodes, currently airing',
        '52347':
          'Tensei shitara Ken deshita / Reincarnated as a Sword, tv, started 2022-10-05, 12 episodes, finished airing',
      },
    );
  });

  it('leaves out what is unknown and sends at most 10 synonyms', () => {
    const bare: MalCandidate = {
      ...numbers,
      id: 7,
      title: 'Bare',
      english: undefined,
      synonyms: Array.from({ length: 12 }, (_, i) => `Syn ${i}`),
      year: undefined,
      episodes: undefined,
      mediaType: undefined,
      airing: null,
      startDate: null,
      startSeason: null,
    };

    expect(malJevState({ slug: 'bare-a1', name: 'Bare' }, [bare])).toEqual({
      source: { title: 'Bare', season: 1 },
      candidates: [
        {
          id: 7,
          title: 'Bare',
          synonyms: Array.from({ length: 10 }, (_, i) => `Syn ${i}`),
        },
      ],
    });
    expect(malJevQuestions([bare]).match.criteria).toEqual({
      '7': 'Bare, media type unknown, start unknown, episode count unknown, airing status unknown',
    });
  });

  it('offers Jev the shows of every search once, without promos, up to 20', () => {
    const unrelated = (from: number, count: number): MalCandidate[] =>
      Array.from({ length: count }, (_, i) => ({
        ...firstSeason,
        id: from + i,
        title: `Unrelated ${from + i}`,
      }));

    const offered = jevCandidates([
      [{ ...firstSeason, id: 900, mediaType: 'pv' }, secondSeason],
      [secondSeason, firstSeason, ...unrelated(100, 10)],
      [{ ...firstSeason, id: 901, mediaType: 'music' }, ...unrelated(200, 10)],
    ]);

    expect(offered.map((c) => c.id)).toEqual([
      53913, 52347, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 200, 201,
      202, 203, 204, 205, 206, 207,
    ]);
  });
});
