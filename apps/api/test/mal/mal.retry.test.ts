import { describe, expect, it } from 'vitest';
import { isMalSettled } from '../../src/mal/mal.retry.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const now = new Date('2026-06-01T00:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('isMalSettled', () => {
  it('is not settled for a title with no row', () => {
    expect(isMalSettled(undefined, now)).toBe(false);
  });

  it.each([
    [
      'keeps a finished show for 7 days',
      { airing: 'finished_airing', fetched: 7 * DAY - 1 },
      true,
    ],
    [
      'refreshes a finished show after 7 days',
      { airing: 'finished_airing', fetched: 7 * DAY },
      false,
    ],
    [
      'keeps an airing show for 1 day',
      { airing: 'currently_airing', fetched: DAY - 1 },
      true,
    ],
    [
      'refreshes an airing show after 1 day',
      { airing: 'currently_airing', fetched: DAY },
      false,
    ],
    [
      'fetches a row saved without an airing status once more',
      { airing: null, fetched: 20 * MINUTE },
      false,
    ],
    [
      'fetches a row saved before start dates were stored once more',
      { airing: 'finished_airing', fetched: 20 * MINUTE, datesKnown: false },
      false,
    ],
    [
      'waits 10 minutes after a refresh that failed',
      {
        airing: 'finished_airing',
        fetched: 8 * DAY,
        attempted: 10 * MINUTE - 1,
      },
      true,
    ],
    [
      'tries a failed refresh again after 10 minutes',
      { airing: 'finished_airing', fetched: 8 * DAY, attempted: 10 * MINUTE },
      false,
    ],
  ] as const)('%s', (_, row, settled) => {
    expect(
      isMalSettled(
        {
          status: 'ok',
          matcherVersion: 3,
          airing: row.airing,
          datesKnown: 'datesKnown' in row ? row.datesKnown : true,
          fetchedAt: ago(row.fetched),
          attemptedAt: ago('attempted' in row ? row.attempted : row.fetched),
        },
        now,
      ),
    ).toBe(settled);
  });

  it.each([
    ['keeps a failure for 10 minutes', 'failed', 3, 10 * MINUTE - 1, true],
    ['tries a failure again after 10 minutes', 'failed', 3, 10 * MINUTE, false],
    ['keeps a no-match for 7 days', 'none', 6, 7 * DAY - 1, true],
    ['tries a no-match again after 7 days', 'none', 6, 7 * DAY, false],
    [
      'tries a no-match from an older matcher again at once',
      'none',
      3,
      MINUTE,
      false,
    ],
  ] as const)('%s', (_, status, matcherVersion, attempted, settled) => {
    expect(
      isMalSettled(
        {
          status,
          matcherVersion,
          fetchedAt: null,
          attemptedAt: ago(attempted),
        },
        now,
      ),
    ).toBe(settled);
  });

  it('tries a miss again when the source’s other names arrived after its last try, and never a match', () => {
    const miss = {
      status: 'none' as const,
      matcherVersion: 6,
      fetchedAt: null,
      attemptedAt: ago(1000),
    };
    const match = {
      status: 'ok' as const,
      matcherVersion: 3,
      airing: 'finished_airing' as const,
      datesKnown: true,
      fetchedAt: ago(1000),
      attemptedAt: ago(1000),
    };

    expect(isMalSettled(miss, now, ago(1000))).toBe(true);
    expect(isMalSettled(miss, now, ago(999))).toBe(false);
    expect(isMalSettled(match, now, ago(999))).toBe(true);
  });
});
