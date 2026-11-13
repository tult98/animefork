import { describe, expect, it } from 'vitest';
import {
  distinctRomaji,
  parseSeasonNumber,
  searchQueries,
  stripSeasonMarker,
} from '../../../src/art/tmdb/titles.ts';

describe('parseSeasonNumber', () => {
  it.each([
    ['the season name before the title name', 'Season 3', 'Show Season 2', 3],
    ['an ordinal marker in the title name', undefined, 'Show 2nd Season', 2],
    ['a Vietnamese "Mùa" marker', undefined, 'Show Mùa 2', 2],
    ['a Vietnamese "Phần" marker', undefined, 'Show Phần 5', 5],
    ['season 1 for a name without a marker', undefined, 'Show', 1],
    ['season 1 for a season 0', 'Season 0', 'Show', 1],
  ])('reads %s', (_, seasonName, name, season) => {
    expect(parseSeasonNumber(seasonName, name)).toBe(season);
  });
});

describe('stripSeasonMarker', () => {
  it.each([
    ['Show 2nd Season', 'Show'],
    ['Show: Season 2', 'Show'],
    ['Show - Mùa 2', 'Show'],
    ['Show Phần 2 Special', 'Show Special'],
    ['Show', 'Show'],
    ['Season 2', 'Season 2'],
  ])('turns "%s" into "%s"', (name, stripped) => {
    expect(stripSeasonMarker(name)).toBe(stripped);
  });
});

describe('searchQueries', () => {
  it.each([
    ['one query for a plain name', 'Tonikaku Kawaii', ['Tonikaku Kawaii']],
    [
      'the franchise name, then the name without its arc suffix',
      'Tokyo Revengers: Santen Sensou-hen',
      [
        'Tokyo Revengers: Santen Sensou-hen',
        'Tokyo Revengers',
        'Tokyo Revengers: Santen Sensou',
      ],
    ],
    [
      'the name without its season marker first',
      'Show: Subtitle 2nd Season',
      ['Show: Subtitle', 'Show'],
    ],
    [
      'the part before a spaced dash',
      'Franchise - Part Two',
      ['Franchise - Part Two', 'Franchise'],
    ],
    [
      'the name without a "Movie" suffix',
      'Jujutsu Kaisen Movie',
      ['Jujutsu Kaisen Movie', 'Jujutsu Kaisen'],
    ],
    [
      'no franchise name shorter than 3 characters',
      'A: Long Subtitle',
      ['A: Long Subtitle'],
    ],
  ])('asks %s', (_, name, queries) => {
    expect(searchQueries(name)).toEqual(queries);
  });

  it.each([
    [
      'the first 6 words of the slug, then the first 3',
      'Pháp Sư Bá Đạo',
      'tsuihou-sareta-cheat-fuyo-majutsushi-wa-kimama-na-second-life-a6125',
      [
        'Pháp Sư Bá Đạo',
        'tsuihou sareta cheat fuyo majutsushi wa',
        'tsuihou sareta cheat',
      ],
    ],
    [
      'the slug without its id and season marker',
      'Tên',
      'show-name-2nd-season-a12',
      ['Tên', 'show name'],
    ],
    [
      'nothing more when the slug repeats the name',
      'tonikaku kawaii',
      'tonikaku-kawaii-a3860',
      ['tonikaku kawaii'],
    ],
    ['nothing more when the slug is only an id', 'Name', '-a1', ['Name']],
  ])('adds %s after the name queries', (_, name, slug, queries) => {
    expect(searchQueries(name, slug)).toEqual(queries);
  });
});

describe('distinctRomaji', () => {
  it.each([
    [
      'every word of the slug without its id and season marker',
      'kimama-na-second-life-season-2-a99',
      'Tên Việt',
      'kimama na second life',
    ],
    [
      'nothing when the slug repeats the name',
      'tonikaku-kawaii-a3860',
      'Tonikaku: Kawaii',
      undefined,
    ],
    ['nothing when the slug is only an id', '-a12', 'Anything', undefined],
  ])('gives %s', (_, slug, name, romaji) => {
    expect(distinctRomaji(slug, name)).toBe(romaji);
  });
});
