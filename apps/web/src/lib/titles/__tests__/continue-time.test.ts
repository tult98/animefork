import { describe, expect, it } from 'vitest';
import { FINISHED_LABEL, formatWatched } from '../continue-time.ts';

describe('formatWatched', () => {
  it('rounds both sides to whole minutes', () => {
    expect(formatWatched(720, 1440)).toBe('12 / 24 phút');
    expect(formatWatched(749, 1470)).toBe('12 / 25 phút');
    expect(formatWatched(0, 1440)).toBe('0 / 24 phút');
  });

  it('never reads 0 for the length of a short clip', () => {
    expect(formatWatched(10, 20)).toBe('0 / 1 phút');
  });

  it('does not show more than the total', () => {
    expect(formatWatched(5000, 1440)).toBe('24 / 24 phút');
    expect(formatWatched(-5, 1440)).toBe('0 / 24 phút');
  });

  it('labels a finished episode in Vietnamese', () => {
    expect(FINISHED_LABEL).toBe('Đã xem xong');
  });
});
