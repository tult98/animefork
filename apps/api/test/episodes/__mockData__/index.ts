import { MAL_MATCHER_VERSION } from '../../../src/mal/mal.retry.ts';
import type { StoredMal } from '../../../src/mal/mal.store.ts';

// A title matched on MyAnimeList that finished airing. A test spreads it and sets its own slug and malId.
export const mockMalMatch: StoredMal = {
  slug: 'black-clover',
  status: 'ok',
  malId: 34572,
  score: 8.14,
  voters: 1000,
  rank: 400,
  popularity: 30,
  members: 2000,
  airing: 'finished_airing',
  episodes: 170,
  startDate: '2017-10-03',
  startSeason: { year: 2017, season: 'fall' },
  trailerYoutubeId: null,
  mediaType: null,
  english: null,
  synonyms: [],
  datesKnown: true,
  matchedTitle: 'Black Clover',
  matchScore: 0.9,
  matchedBy: 'score',
  matcherVersion: MAL_MATCHER_VERSION,
  reason: null,
  attemptedAt: new Date('2026-03-01T00:00:00Z'),
  fetchedAt: new Date('2026-03-01T00:00:00Z'),
};
