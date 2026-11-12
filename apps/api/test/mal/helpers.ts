import type { MalCandidate } from '../../src/mal/mal.client.ts';

export function candidate(over: Partial<MalCandidate> = {}): MalCandidate {
  return {
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
    ...over,
  };
}

// The JSON MAL answers for one anime node.
export function node(over: Record<string, unknown> = {}) {
  return {
    id: 34572,
    title: 'Black Clover',
    alternative_titles: { synonyms: ['BC'], en: 'Black Clover' },
    start_season: { year: 2017, season: 'fall' },
    num_episodes: 170,
    media_type: 'tv',
    mean: 7.55,
    num_scoring_users: 69596,
    rank: 2006,
    popularity: 1762,
    num_list_users: 157000,
    status: 'finished_airing',
    ...over,
  };
}

// The slug's "II" is not read as a season marker, so the score never clears the gate for this title.
export const TENKEN_INPUT = {
  slug: 'tensei-shitara-ken-deshita-II-a6066',
  name: 'Chuyển Sinh Thành Thanh Kiếm II',
  year: 2026,
  episodeCount: 5,
};

export const TENKEN_2 = candidate({
  id: 53913,
  title: 'Tensei shitara Ken deshita II',
  english: 'Reincarnated as a Sword Season 2',
  synonyms: ['I became the sword by transmigrating 2nd Season', 'TenKen 2'],
  year: 2026,
  episodes: 12,
  mediaType: 'tv',
  airing: 'currently_airing',
  startDate: null,
  startSeason: { year: 2026, season: 'winter' },
});

export const TENKEN_1 = candidate({
  id: 52347,
  title: 'Tensei shitara Ken deshita',
  english: 'Reincarnated as a Sword',
  synonyms: ['I became the sword by transmigrating', 'TenKen'],
  year: 2022,
  episodes: 12,
  mediaType: 'tv',
  airing: 'finished_airing',
  startDate: '2022-10-05',
  startSeason: { year: 2022, season: 'fall' },
});
