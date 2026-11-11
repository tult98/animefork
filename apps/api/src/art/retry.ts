export type TitleStatus = 'matched' | 'no_match' | 'failed';
export type MissStatus = Exclude<TitleStatus, 'matched'>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// Version history: 2 added the TMDB poster, 3 added the Jev second-stage matcher, 4 added show scope.
export const MATCHER_VERSION = 4;

// | status   | written below version | settled for  | then                                     |
// | -------- | --------------------- | ------------ | ---------------------------------------- |
// | matched  | MATCHED_REFRESH_BELOW | forever      | answers ready, refills in the background |
// | no_match | MISS_RETRY_BELOW      | not at all   | retried on its next lookup               |
// | no_match | (current)             | 7 days       | retried on its next lookup               |
// | failed   | MISS_RETRY_BELOW      | not at all   | retried on its next lookup               |
// | failed   | (current)             | 10 minutes   | retried on its next lookup               |
export const MATCHED_REFRESH_BELOW = 2;
export const MISS_RETRY_BELOW = 4;

export const RETRY_AFTER_MS: Record<TitleStatus, number> = {
  matched: Number.POSITIVE_INFINITY,
  no_match: 7 * DAY,
  failed: 10 * MINUTE,
};

interface RetryRow {
  status: TitleStatus;
  matcherVersion: number;
  attemptedAt: Date;
}

export function isStale(row: Omit<RetryRow, 'attemptedAt'>): boolean {
  return row.status === 'matched' && row.matcherVersion < MATCHED_REFRESH_BELOW;
}

export function isSettled(row: RetryRow, now: Date): boolean {
  if (row.status !== 'matched' && row.matcherVersion < MISS_RETRY_BELOW) {
    return false;
  }
  return now.getTime() - row.attemptedAt.getTime() < RETRY_AFTER_MS[row.status];
}

// | overview status | settled for | then                       |
// | --------------- | ----------- | -------------------------- |
// | (null)          | not at all  | fetched on its next lookup |
// | ok              | forever     | never fetched again        |
// | none            | 7 days      | fetched on its next lookup |
// | failed          | 10 minutes  | fetched on its next lookup |
export type OverviewStatus = 'ok' | 'none' | 'failed';

export const OVERVIEW_RETRY_AFTER_MS: Record<OverviewStatus, number> = {
  ok: Number.POSITIVE_INFINITY,
  none: 7 * DAY,
  failed: 10 * MINUTE,
};

interface OverviewRetryRow {
  overviewStatus: OverviewStatus | null;
  overviewAttemptedAt: Date | null;
}

export function isOverviewSettled(row: OverviewRetryRow, now: Date): boolean {
  if (row.overviewStatus === 'ok') return true;
  if (row.overviewStatus === null || row.overviewAttemptedAt === null) {
    return false;
  }
  return (
    now.getTime() - row.overviewAttemptedAt.getTime() <
    OVERVIEW_RETRY_AFTER_MS[row.overviewStatus]
  );
}
