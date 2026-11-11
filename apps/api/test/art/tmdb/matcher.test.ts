import { describe, expect, it } from 'vitest';
import {
  BaselineMatcher,
  decide,
  MIN_MATCH_PROBABILITY,
  normalizeTitle,
  scoreCandidate,
  titleSimilarity,
  type Candidate,
  type MatchQuestion,
} from '../../../src/art/tmdb/matcher.ts';

const question = (over: Partial<MatchQuestion> = {}): MatchQuestion => ({
  slug: 'tonikaku-kawaii-a3860',
  sourceTitle: 'Tonikaku Kawaii',
  season: 1,
  candidates: [
    {
      id: 1,
      name: 'Tonikaku Kawaii',
      originalName: 'トニカクカワイイ',
      alternativeTitles: [],
      firstAirDate: '2020-10-03',
      episodeCount: 12,
    },
    {
      id: 2,
      name: 'Kaguya-sama: Love is War',
      originalName: 'かぐや様は告らせたい',
      alternativeTitles: [],
      firstAirDate: '2019-01-12',
      episodeCount: 12,
    },
  ],
  ...over,
});

describe('normalizeTitle', () => {
  it('drops diacritics, punctuation and season markers', () => {
    expect(normalizeTitle('Tonikaku: Kawaii 2nd Season')).toBe(
      'tonikaku kawaii',
    );
    expect(normalizeTitle('Đại Chiến Mùa 2')).toBe('dai chien');
  });
});

describe('titleSimilarity', () => {
  it('is 1 for equal titles and low for unrelated ones', () => {
    expect(titleSimilarity('Naruto', 'naruto!')).toBe(1);
    expect(titleSimilarity('Naruto', 'One Piece')).toBeLessThan(0.3);
  });
});

describe('BaselineMatcher', () => {
  const matcher = new BaselineMatcher();

  it('picks the exact title and clears the threshold', async () => {
    const answer = await matcher.match(
      question({ year: 2020, episodeCount: 12 }),
    );
    expect(answer.choice).toBe(1);
    expect(decide(answer)).toBe(1);
  });

  it('clears the threshold on an exact title with no other signal', async () => {
    expect(decide(await matcher.match(question()))).toBe(1);
  });

  it('rejects a near title with a wrong year and episode count', async () => {
    const answer = await matcher.match(
      question({
        sourceTitle: 'Tonikaku Kawaii Gaiden',
        year: 2008,
        episodeCount: 3,
      }),
    );
    expect(answer.probability).toBeLessThan(MIN_MATCH_PROBABILITY);
    expect(decide(answer)).toBeNull();
  });

  it('matches a romaji source title through an alternative title', async () => {
    const [show, other] = question().candidates as [Candidate, Candidate];
    const aliased = {
      ...show,
      name: 'TONIKAWA: Over the Moon for You',
      alternativeTitles: ['Tonikaku Kawaii'],
    };
    const answer = await matcher.match(
      question({ year: 2020, candidates: [aliased, other] }),
    );
    expect(decide(answer)).toBe(1);
    const without = await matcher.match(
      question({
        year: 2020,
        candidates: [{ ...aliased, alternativeTitles: [] }, other],
      }),
    );
    expect(decide(without)).toBeNull();
  });

  it('rejects a near name that only an alternative title resembles', async () => {
    const [show] = question().candidates as [Candidate];
    const answer = await matcher.match(
      question({
        sourceTitle: 'Tonikaku Kawaii Gaiden',
        year: 2020,
        candidates: [
          { ...show, name: 'TONIKAWA', alternativeTitles: ['Tonikaku Kawaii'] },
        ],
      }),
    );
    expect(decide(answer)).toBeNull();
  });

  it('refuses a tie between two equally good candidates', async () => {
    const twin = question().candidates[0]!;
    const answer = await matcher.match(
      question({ candidates: [twin, { ...twin, id: 9 }] }),
    );
    expect(answer.choice).toBeNull();
  });

  it('answers null with no candidates', async () => {
    expect(await matcher.match(question({ candidates: [] }))).toEqual({
      choice: null,
      probability: 0,
      by: 'baseline',
      scope: 'season',
    });
  });
});

describe('scoreCandidate with a romaji', () => {
  const vietnamese = 'Thợ Săn Bóng Đêm';
  const candidate: Candidate = {
    id: 9,
    name: 'The Laid-Off Cheat-Granting Mage',
    originalName: '追放された付与魔術師',
    alternativeTitles: ['Tsuihou Sareta Cheat Fuyo Majutsushi'],
    firstAirDate: '2026-01-01',
    episodeCount: 12,
  };
  const ask = (romaji?: string) =>
    scoreCandidate(
      question({ sourceTitle: vietnamese, romaji, year: 2026 }),
      candidate,
    );

  it('rises when the romaji matches an alternative title', () => {
    expect(ask('tsuihou sareta cheat fuyo majutsushi')).toBeGreaterThan(
      ask() + 0.4,
    );
  });

  it('is unchanged without a romaji', () => {
    expect(ask(undefined)).toBe(
      scoreCandidate(
        question({ sourceTitle: vietnamese, year: 2026 }),
        candidate,
      ),
    );
  });

  it('ignores a romaji of fewer than 2 words', () => {
    expect(ask('tsuihou')).toBe(ask());
    expect(ask('tsuihou sareta')).toBeGreaterThan(ask());
  });
});
