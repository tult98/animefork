import { describe, expect, it } from 'vitest';
import {
  parseSeasonNumber,
  searchQueries,
  stripSeasonMarker,
} from '../../../src/art/tmdb/titles.ts';

describe('parseSeasonNumber', () => {
  it('reads the season name first and the title name as a fallback', () => {
    expect(parseSeasonNumber('Season 3', 'Show Season 2')).toBe(3);
    expect(parseSeasonNumber(undefined, 'Show 2nd Season')).toBe(2);
    expect(parseSeasonNumber(undefined, 'Show Season 4')).toBe(4);
    expect(parseSeasonNumber(undefined, 'Show Mùa 2')).toBe(2);
    expect(parseSeasonNumber(undefined, 'Show Phần 5')).toBe(5);
  });

  it('defaults to season 1', () => {
    expect(parseSeasonNumber(undefined)).toBe(1);
    expect(parseSeasonNumber(undefined, 'Show')).toBe(1);
    expect(parseSeasonNumber('Season 0', 'Show')).toBe(1);
  });
});

describe('stripSeasonMarker', () => {
  it('removes the marker and the dangling separator', () => {
    expect(stripSeasonMarker('Show 2nd Season')).toBe('Show');
    expect(stripSeasonMarker('Show: Season 2')).toBe('Show');
    expect(stripSeasonMarker('Show - Mùa 2')).toBe('Show');
    expect(stripSeasonMarker('Show Phần 2 Special')).toBe('Show Special');
  });

  it('keeps a name without a marker, or one that is only a marker', () => {
    expect(stripSeasonMarker('Show')).toBe('Show');
    expect(stripSeasonMarker('Season 2')).toBe('Season 2');
  });
});

describe('searchQueries', () => {
  it('falls back from the full name to the franchise and the arc-less name', () => {
    expect(searchQueries('Tokyo Revengers: Santen Sensou-hen')).toEqual([
      'Tokyo Revengers: Santen Sensou-hen',
      'Tokyo Revengers',
      'Tokyo Revengers: Santen Sensou',
    ]);
  });

  it('starts from the name without its season marker', () => {
    expect(searchQueries('Show: Subtitle 2nd Season')).toEqual([
      'Show: Subtitle',
      'Show',
    ]);
  });

  it('splits on a spaced dash', () => {
    expect(searchQueries('Franchise - Part Two')).toEqual([
      'Franchise - Part Two',
      'Franchise',
    ]);
  });

  it('strips an arc or movie suffix, case-insensitively', () => {
    expect(searchQueries('Jujutsu Kaisen Movie')).toEqual([
      'Jujutsu Kaisen Movie',
      'Jujutsu Kaisen',
    ]);
    expect(searchQueries('One Piece ARC')).toEqual([
      'One Piece ARC',
      'One Piece',
    ]);
  });

  it('gives one query for a plain name', () => {
    expect(searchQueries('Tonikaku Kawaii')).toEqual(['Tonikaku Kawaii']);
  });

  it('ignores a prefix shorter than 3 characters', () => {
    expect(searchQueries('A: Long Subtitle')).toEqual(['A: Long Subtitle']);
  });

  it('dedupes queries that collapse to the same text', () => {
    expect(searchQueries('Show: Arc')).toEqual(['Show: Arc', 'Show']);
  });
});
