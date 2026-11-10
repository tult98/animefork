import { describe, expect, it } from 'vitest';
import { scrollDistance, scrollEdges } from './scroll-edges.ts';

describe('scrollEdges', () => {
  it('is at the start before any scrolling', () => {
    expect(
      scrollEdges({ scrollLeft: 0, clientWidth: 1000, scrollWidth: 3000 }),
    ).toEqual({ atStart: true, atEnd: false });
  });

  it('is in the middle after scrolling', () => {
    expect(
      scrollEdges({ scrollLeft: 900, clientWidth: 1000, scrollWidth: 3000 }),
    ).toEqual({ atStart: false, atEnd: false });
  });

  it('is at the end within a pixel of the last offset', () => {
    expect(
      scrollEdges({ scrollLeft: 1999.5, clientWidth: 1000, scrollWidth: 3000 }),
    ).toEqual({ atStart: false, atEnd: true });
  });

  it('is at both edges when nothing overflows', () => {
    expect(
      scrollEdges({ scrollLeft: 0, clientWidth: 1000, scrollWidth: 1000 }),
    ).toEqual({ atStart: true, atEnd: true });
  });
});

describe('scrollDistance', () => {
  it('moves 90% of the width in the given direction', () => {
    expect(scrollDistance(1000, 1)).toBe(900);
    expect(scrollDistance(1000, -1)).toBe(-900);
  });
});
