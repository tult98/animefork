import { describe, expect, it } from 'vitest';
import { isEpisodeListSettled } from '../../src/episodes/episode.retry.ts';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

describe('isEpisodeListSettled', () => {
  it('is not settled for a list that was never read', () => {
    expect(
      isEpisodeListSettled(
        undefined,
        'finished_airing',
        new Date('2026-03-01T00:00:00Z'),
      ),
    ).toBe(false);
  });

  it.each([
    [
      'a failed read, 9 minutes ago',
      'failed',
      'finished_airing',
      'finished_airing',
      9 * 60_000,
      true,
    ],
    [
      'a failed read, 11 minutes ago',
      'failed',
      'finished_airing',
      'finished_airing',
      11 * 60_000,
      false,
    ],
    [
      'an airing show, 23 hours ago',
      'ok',
      'currently_airing',
      'currently_airing',
      23 * HOUR,
      true,
    ],
    [
      'an airing show, 25 hours ago',
      'ok',
      'currently_airing',
      'currently_airing',
      25 * HOUR,
      false,
    ],
    [
      'a finished show, 364 days ago',
      'ok',
      'finished_airing',
      'finished_airing',
      364 * DAY,
      true,
    ],
    [
      'a finished show, 366 days ago',
      'ok',
      'finished_airing',
      'finished_airing',
      366 * DAY,
      false,
    ],
    [
      'a show that finished since it was read, 25 hours ago',
      'ok',
      'currently_airing',
      'finished_airing',
      25 * HOUR,
      false,
    ],
  ] as const)(
    '%s',
    (_name, status, airingWhenRead, airingNow, sinceMs, settled) => {
      const now = new Date('2026-03-01T00:00:00Z');

      const result = isEpisodeListSettled(
        {
          malId: 21,
          status,
          airing: airingWhenRead,
          attemptedAt: new Date(now.getTime() - sinceMs),
        },
        airingNow,
        now,
      );

      expect(result).toBe(settled);
    },
  );
});
