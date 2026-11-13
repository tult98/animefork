import type { MalAiring } from '../art/contract.ts';

export type EpisodeListStatus = 'ok' | 'failed';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// A show that keeps airing gains episodes, so its list is read about daily.
export const EPISODE_AIRING_REFRESH_AFTER_MS = DAY;
// A finished show's list no longer grows, so it is read once and then only rarely.
export const EPISODE_FINISHED_REFRESH_AFTER_MS = 365 * DAY;
export const EPISODE_RETRY_AFTER_MS = 10 * MINUTE;

export interface EpisodeListAttempt {
  malId: number;
  status: EpisodeListStatus;
  // The airing status MAL had when the list was read.
  airing: MalAiring | null;
  attemptedAt: Date;
}

// | attempt | settled for                                                          |
// | ------- | -------------------------------------------------------------------- |
// | (none)  | not at all                                                           |
// | ok      | 1 day, or 1 year when it was read after the show finished airing     |
// | failed  | 10 minutes                                                           |
// A list read while the show aired is read again after a day even once MAL says it finished, to catch the last episodes.
export function isEpisodeListSettled(
  attempt: EpisodeListAttempt | undefined,
  airing: MalAiring | null,
  now: Date,
): boolean {
  if (!attempt) return false;
  const since = now.getTime() - attempt.attemptedAt.getTime();
  if (attempt.status === 'failed') return since < EPISODE_RETRY_AFTER_MS;
  const finished =
    attempt.airing === 'finished_airing' && airing === 'finished_airing';
  return (
    since <
    (finished
      ? EPISODE_FINISHED_REFRESH_AFTER_MS
      : EPISODE_AIRING_REFRESH_AFTER_MS)
  );
}
