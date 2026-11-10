import { describe, expect, it } from 'vitest';
import {
  isSettled,
  isStale,
  MATCHED_REFRESH_BELOW,
  MATCHER_VERSION,
  MISS_RETRY_BELOW,
  RETRY_AFTER_MS,
  type TitleStatus,
} from '../../src/art/retry.ts';

const at = new Date('2026-01-01T00:00:00Z');
const after = (ms: number) => new Date(at.getTime() + ms);
const row = (status: TitleStatus, matcherVersion = MATCHER_VERSION) => ({
  status,
  matcherVersion,
  attemptedAt: at,
});

describe('retry table', () => {
  it('writes new rows at the version misses are retried below', () => {
    expect(MATCHER_VERSION).toBe(3);
    expect(MISS_RETRY_BELOW).toBe(3);
    expect(MATCHED_REFRESH_BELOW).toBe(2);
  });

  it('never retries a matched row, whatever its version', () => {
    for (const version of [1, 2, 3]) {
      expect(
        isSettled(row('matched', version), after(10 * 365 * 86_400_000)),
      ).toBe(true);
    }
  });

  it.each<[TitleStatus, number]>([
    ['no_match', 7 * 86_400_000],
    ['failed', 10 * 60_000],
  ])(
    'settles a current %s row inside its window and frees it at the edge',
    (status, window) => {
      expect(RETRY_AFTER_MS[status]).toBe(window);
      expect(isSettled(row(status), after(window - 1))).toBe(true);
      expect(isSettled(row(status), after(window))).toBe(false);
    },
  );

  it.each<TitleStatus>(['no_match', 'failed'])(
    'frees a %s row written below MISS_RETRY_BELOW at once',
    (status) => {
      expect(isSettled(row(status, MISS_RETRY_BELOW - 1), at)).toBe(false);
      expect(isSettled(row(status, MISS_RETRY_BELOW), at)).toBe(true);
    },
  );

  it.each<[TitleStatus, number, boolean]>([
    ['matched', 1, true],
    ['matched', 2, false],
    ['matched', 3, false],
    ['no_match', 1, false],
    ['failed', 1, false],
  ])('calls a %s row at version %i stale: %s', (status, version, stale) => {
    expect(isStale({ status, matcherVersion: version })).toBe(stale);
  });
});
