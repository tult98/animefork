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
    broadcast: { day: 'tuesday', time: '18:25' },
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
