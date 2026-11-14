import { describe, expect, it } from 'vitest';
import {
  BaselineMatcher,
  decide,
  normalizeTitle,
} from '../../../src/art/tmdb/matcher.ts';

describe('normalizeTitle', () => {
  it.each([
    ['Tonikaku: Kawaii 2nd Season', 'tonikaku kawaii'],
    ['Đại Chiến Mùa 2', 'dai chien'],
    ['Show Part 2', 'show'],
  ])('turns "%s" into "%s"', (title, normalized) => {
    expect(normalizeTitle(title)).toBe(normalized);
  });
});

describe('BaselineMatcher', () => {
  it('picks the candidate whose title, year and episode count all agree, at probability 1', async () => {
    const answer = await new BaselineMatcher().match({
      slug: 'tonikaku-kawaii-a3860',
      sourceTitle: 'Tonikaku Kawaii',
      season: 1,
      year: 2020,
      episodeCount: 12,
      candidates: [
        {
          kind: 'tv',
          id: 1,
          name: 'Tonikaku Kawaii',
          originalName: 'トニカクカワイイ',
          alternativeTitles: [],
          firstAirDate: '2020-10-03',
          episodeCount: 12,
        },
        {
          kind: 'tv',
          id: 2,
          name: 'Kaguya-sama: Love is War',
          originalName: 'かぐや様は告らせたい',
          alternativeTitles: [],
          firstAirDate: '2019-01-12',
          episodeCount: 12,
        },
      ],
    });

    expect(answer).toEqual({
      choice: 1,
      kind: 'tv',
      probability: 1,
      episodeOffset: 0,
      by: 'baseline',
      scope: 'season',
    });
  });

  it.each([
    ['accepts an exact title when the year is unknown', {}, 1],
    ['accepts an exact title aired a year apart', { year: 2021 }, 1],
    ['rejects an exact title aired years apart', { year: 2008 }, null],
    [
      'rejects a near title with the wrong year and episode count',
      { sourceTitle: 'Tonikaku Kawaii Gaiden', year: 2008, episodeCount: 3 },
      null,
    ],
  ])('%s', async (_, source, choice) => {
    const answer = await new BaselineMatcher().match({
      slug: 'tonikaku-kawaii-a3860',
      sourceTitle: 'Tonikaku Kawaii',
      season: 1,
      ...source,
      candidates: [
        {
          kind: 'tv',
          id: 1,
          name: 'Tonikaku Kawaii',
          originalName: 'トニカクカワイイ',
          alternativeTitles: [],
          firstAirDate: '2020-10-03',
          episodeCount: 12,
        },
      ],
    });

    expect(decide(answer)).toBe(choice);
  });

  it.each([
    ['rejects a Vietnamese title no candidate name resembles', {}, null],
    [
      'accepts it through another name the source lists',
      { otherNames: ['Soul Land'] },
      9,
    ],
    [
      'accepts it through the slug romaji, which an alternative title repeats',
      { romaji: 'douluo dalu' },
      9,
    ],
    ['ignores a romaji of one word', { romaji: 'douluo' }, null],
  ])('%s', async (_, names, choice) => {
    const answer = await new BaselineMatcher().match({
      slug: 'douluo-dalu-a2000',
      sourceTitle: 'Đấu La Đại Lục',
      season: 1,
      year: 2018,
      ...names,
      candidates: [
        {
          kind: 'tv',
          id: 9,
          name: 'Soul Land',
          originalName: '斗罗大陆',
          alternativeTitles: ['Douluo Dalu'],
          firstAirDate: '2018-01-20',
          episodeCount: 52,
        },
      ],
    });

    expect(decide(answer)).toBe(choice);
  });

  it('picks neither of two candidates that score the same', async () => {
    const answer = await new BaselineMatcher().match({
      slug: 'tonikaku-kawaii-a3860',
      sourceTitle: 'Tonikaku Kawaii',
      season: 1,
      candidates: [
        {
          kind: 'tv',
          id: 1,
          name: 'Tonikaku Kawaii',
          originalName: 'トニカクカワイイ',
          alternativeTitles: [],
        },
        {
          kind: 'tv',
          id: 9,
          name: 'Tonikaku Kawaii',
          originalName: 'トニカクカワイイ',
          alternativeTitles: [],
        },
      ],
    });

    expect(answer.choice).toBeNull();
  });
});
