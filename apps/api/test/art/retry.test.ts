import { describe, expect, it } from 'vitest';
import { isOverviewSettled, isSettled, isStale } from '../../src/art/retry.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const at = new Date('2026-01-01T00:00:00Z');
const after = (ms: number) => new Date(at.getTime() + ms);

describe('isSettled', () => {
  it.each([
    ['a match ten years old', 'matched', 1, 3650 * DAY, true],
    ['a miss just under a week old', 'no_match', 4, 7 * DAY - 1, true],
    ['a miss a week old', 'no_match', 4, 7 * DAY, false],
    [
      'a failure just under ten minutes old',
      'failed',
      4,
      10 * MINUTE - 1,
      true,
    ],
    ['a failure ten minutes old', 'failed', 4, 10 * MINUTE, false],
    ['a fresh miss written before matcher version 4', 'no_match', 3, 0, false],
    ['a fresh failure written before matcher version 4', 'failed', 3, 0, false],
  ] as const)('%s', (_name, status, matcherVersion, age, settled) => {
    const row = { status, matcherVersion, attemptedAt: at };

    expect(isSettled(row, after(age))).toBe(settled);
  });

  it.each([
    ['a miss tried before the other names arrived', 'no_match', 1, false],
    ['a miss tried in the instant the names arrived', 'no_match', 0, true],
    ['a miss tried after the names arrived', 'no_match', -1, true],
    ['a match tried before the names arrived', 'matched', 1, true],
  ] as const)('%s', (_name, status, namesArrived, settled) => {
    const row = { status, matcherVersion: 4, attemptedAt: at };

    expect(isSettled(row, after(1000), after(namesArrived))).toBe(settled);
  });
});

describe('isStale', () => {
  it.each([
    ['matched', 1, true],
    ['matched', 2, false],
    ['no_match', 1, false],
  ] as const)(
    'a %s row of matcher version %i: %s',
    (status, matcherVersion, stale) => {
      expect(isStale({ status, matcherVersion })).toBe(stale);
    },
  );
});

describe('isOverviewSettled', () => {
  it.each([
    ['an overview never asked for', null, 0, false],
    ['a stored overview ten years old', 'ok', 3650 * DAY, true],
    ['no overview found just under a week ago', 'none', 7 * DAY - 1, true],
    ['no overview found a week ago', 'none', 7 * DAY, false],
    ['a failure just under ten minutes old', 'failed', 10 * MINUTE - 1, true],
    ['a failure ten minutes old', 'failed', 10 * MINUTE, false],
  ] as const)('%s', (_name, overviewStatus, age, settled) => {
    const row = {
      overviewStatus,
      overviewAttemptedAt: overviewStatus === null ? null : at,
    };

    expect(isOverviewSettled(row, after(age))).toBe(settled);
  });
});
