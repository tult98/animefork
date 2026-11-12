import { describe, expect, it } from 'vitest';
import { formatClock, percent } from '../format.ts';

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [9.9, '0:09'],
    [65, '1:05'],
    [1440, '24:00'],
    [3725, '1:02:05'],
    [Number.NaN, '0:00'],
    [Number.POSITIVE_INFINITY, '0:00'],
    [-4, '0:00'],
  ])('formats %s as %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });
});

describe('percent', () => {
  it('clamps to 0..100 and survives an unknown duration', () => {
    expect(percent(30, 120)).toBe(25);
    expect(percent(200, 120)).toBe(100);
    expect(percent(-5, 120)).toBe(0);
    expect(percent(5, 0)).toBe(0);
    expect(percent(5, Number.NaN)).toBe(0);
  });
});
