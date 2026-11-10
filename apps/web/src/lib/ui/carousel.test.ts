import { describe, expect, it } from 'vitest';
import { counterLabel, heroMeta, nextIndex, prevIndex } from './carousel.ts';

describe('carousel index math', () => {
  it('advances and wraps from the last slide to the first', () => {
    expect(nextIndex(0, 10)).toBe(1);
    expect(nextIndex(9, 10)).toBe(0);
  });

  it('steps back and wraps from the first slide to the last', () => {
    expect(prevIndex(5, 10)).toBe(4);
    expect(prevIndex(0, 10)).toBe(9);
  });

  it('stays at 0 for an empty list', () => {
    expect(nextIndex(0, 0)).toBe(0);
    expect(prevIndex(0, 0)).toBe(0);
  });

  it('counts from 1', () => {
    expect(counterLabel(0, 10)).toBe('1 trên 10');
    expect(counterLabel(9, 10)).toBe('10 trên 10');
  });
});

describe('heroMeta', () => {
  it('joins the type, first genre, year and rating', () => {
    expect(
      heroMeta({ genres: ['Hành động', 'Phiêu lưu'], year: 2026, rating: 9.3 }),
    ).toBe('TV · Hành động · 2026 · 9.3/10');
  });

  it('skips a missing genre and year', () => {
    expect(heroMeta({ genres: [], year: undefined, rating: 8 })).toBe(
      'TV · 8.0/10',
    );
  });
});
