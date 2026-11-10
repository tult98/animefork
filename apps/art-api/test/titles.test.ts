import { describe, expect, it } from 'vitest';
import { parseSeasonNumber, stripSeasonMarker } from '../src/titles.ts';

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
