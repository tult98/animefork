import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  isCompleted,
} from '../../src/watch-progress/watch-progress.ts';

describe('isCompleted', () => {
  it.each([
    [1259, 1400, false],
    [1260, 1400, true],
    [100, 1400, false],
    [509, 600, false],
    [511, 600, true],
    [3600, 3600, true],
    [50, 100, true],
  ])('position %d of %d is %s', (position, duration, expected) => {
    expect(isCompleted(position, duration)).toBe(expected);
  });
});

describe('clampPosition', () => {
  it('caps the position at the duration', () => {
    expect(clampPosition(5000, 1400)).toBe(1400);
    expect(clampPosition(30, 1400)).toBe(30);
  });
});
