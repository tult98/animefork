import { describe, expect, it } from 'vitest';
import {
  MAL_MATCHER_VERSION,
  MAL_AIRING_REFRESH_AFTER_MS,
  MAL_REFRESH_AFTER_MS,
  MAL_RETRY_AFTER_MS,
  isMalSettled,
} from '../../src/mal/mal.retry.ts';

const now = new Date('2026-06-01T00:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const row = (
  over: Partial<Parameters<typeof isMalSettled>[0] & object> = {},
) => ({
  status: 'ok' as const,
  matcherVersion: MAL_MATCHER_VERSION,
  attemptedAt: ago(0),
  fetchedAt: ago(0),
  ...over,
});

describe('isMalSettled airing', () => {
  const at = (
    age: number,
    airing: 'currently_airing' | 'finished_airing' | null,
  ) => row({ airing, attemptedAt: ago(age), fetchedAt: ago(age) });

  it('checks an airing title daily and a finished one weekly', () => {
    expect(
      isMalSettled(
        at(MAL_AIRING_REFRESH_AFTER_MS - 1, 'currently_airing'),
        now,
      ),
    ).toBe(true);
    expect(
      isMalSettled(at(MAL_AIRING_REFRESH_AFTER_MS, 'currently_airing'), now),
    ).toBe(false);
    expect(
      isMalSettled(at(MAL_AIRING_REFRESH_AFTER_MS, 'finished_airing'), now),
    ).toBe(true);
  });

  it('fetches a row saved before start dates were stored once more', () => {
    const old = (datesKnown: boolean) =>
      row({
        airing: 'finished_airing',
        datesKnown,
        fetchedAt: ago(60_000 * 20),
        attemptedAt: ago(60_000 * 20),
      });
    expect(isMalSettled(old(false), now)).toBe(false);
    expect(isMalSettled(old(true), now)).toBe(true);
  });

  it('fetches a row saved without a status once more', () => {
    expect(isMalSettled(at(60_000 * 20, null), now)).toBe(false);
  });
});

describe('isMalSettled', () => {
  it('is never settled without a row', () => {
    expect(isMalSettled(undefined, now)).toBe(false);
  });

  it('keeps an ok row for the refresh age, then wants a refresh', () => {
    const at = (age: number) =>
      row({ attemptedAt: ago(age), fetchedAt: ago(age) });
    expect(isMalSettled(at(MAL_REFRESH_AFTER_MS - 1), now)).toBe(true);
    expect(isMalSettled(at(MAL_REFRESH_AFTER_MS), now)).toBe(false);
  });

  it('does not retry a failed refresh on every lookup', () => {
    const old = ago(MAL_REFRESH_AFTER_MS + 1);
    expect(
      isMalSettled(row({ fetchedAt: old, attemptedAt: ago(1000) }), now),
    ).toBe(true);
    expect(
      isMalSettled(
        row({ fetchedAt: old, attemptedAt: ago(MAL_RETRY_AFTER_MS.failed) }),
        now,
      ),
    ).toBe(false);
  });

  it('retries a failure after 10 minutes and a no-match after 7 days', () => {
    const miss = (status: 'none' | 'failed', age: number) =>
      row({ status, fetchedAt: null, attemptedAt: ago(age) });
    expect(
      isMalSettled(miss('failed', MAL_RETRY_AFTER_MS.failed - 1), now),
    ).toBe(true);
    expect(isMalSettled(miss('failed', MAL_RETRY_AFTER_MS.failed), now)).toBe(
      false,
    );
    expect(isMalSettled(miss('none', MAL_RETRY_AFTER_MS.none - 1), now)).toBe(
      true,
    );
    expect(isMalSettled(miss('none', MAL_RETRY_AFTER_MS.none), now)).toBe(
      false,
    );
  });

  it('retries a no-match from before Jev, and settles one from version 3 for 7 days', () => {
    const miss = (matcherVersion: number, age: number) =>
      row({
        status: 'none',
        fetchedAt: null,
        matcherVersion,
        attemptedAt: ago(age),
      });
    expect(MAL_MATCHER_VERSION).toBe(3);
    expect(isMalSettled(miss(2, 1000), now)).toBe(false);
    expect(isMalSettled(miss(3, MAL_RETRY_AFTER_MS.none - 1), now)).toBe(true);
    expect(isMalSettled(miss(3, MAL_RETRY_AFTER_MS.none), now)).toBe(false);
  });

  it('tries a no-match again when the matcher has improved since', () => {
    expect(
      isMalSettled(
        row({
          status: 'none',
          fetchedAt: null,
          matcherVersion: MAL_MATCHER_VERSION - 1,
        }),
        now,
      ),
    ).toBe(false);
  });
});
