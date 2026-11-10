export type TitleStatus = 'matched' | 'no_match' | 'failed';
export type MissStatus = Exclude<TitleStatus, 'matched'>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// Version history: 2 added the TMDB poster, 3 added the Jev second-stage matcher.
export const MATCHER_VERSION = 3;

// | status   | written below version | settled for  | then                                     |
// | -------- | --------------------- | ------------ | ---------------------------------------- |
// | matched  | MATCHED_REFRESH_BELOW | forever      | answers ready, refills in the background |
// | no_match | MISS_RETRY_BELOW      | not at all   | retried on its next lookup               |
// | no_match | (current)             | 7 days       | retried on its next lookup               |
// | failed   | MISS_RETRY_BELOW      | not at all   | retried on its next lookup               |
// | failed   | (current)             | 10 minutes   | retried on its next lookup               |
export const MATCHED_REFRESH_BELOW = 2;
export const MISS_RETRY_BELOW = 3;

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
