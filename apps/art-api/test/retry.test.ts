import { describe, expect, it } from 'vitest';
import { isSettled, RETRY_AFTER_MS, type TitleStatus } from '../src/retry.ts';

const at = new Date('2026-01-01T00:00:00Z');
const after = (ms: number) => new Date(at.getTime() + ms);

describe('retry table', () => {
  it('never retries a matched row', () => {
    expect(
      isSettled(
        { status: 'matched', attemptedAt: at },
        after(10 * 365 * 86_400_000),
      ),
    ).toBe(true);
  });

  it.each<[TitleStatus, number]>([
    ['no_match', 7 * 86_400_000],
    ['failed', 10 * 60_000],
  ])(
    'settles a %s row inside its window and frees it at the edge',
    (status, window) => {
      expect(RETRY_AFTER_MS[status]).toBe(window);
      expect(isSettled({ status, attemptedAt: at }, after(window - 1))).toBe(
        true,
      );
      expect(isSettled({ status, attemptedAt: at }, after(window))).toBe(false);
    },
  );
});
