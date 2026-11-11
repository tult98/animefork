export type MalStatus = 'ok' | 'none' | 'failed';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// Bump when the matcher changes, so rows it rejected under the old rules are tried again.
export const MAL_MATCHER_VERSION = 1;

export const MAL_REFRESH_AFTER_MS = 7 * DAY;
export const MAL_RETRY_AFTER_MS: Record<Exclude<MalStatus, 'ok'>, number> = {
  none: 7 * DAY,
  failed: 10 * MINUTE,
};

interface RetryRow {
  status: MalStatus;
  matcherVersion: number;
  attemptedAt: Date;
  fetchedAt: Date | null;
}

// | status | settled for                                  | then                                       |
// | ------ | -------------------------------------------- | ------------------------------------------ |
// | (none) | not at all                                   | matched on its next lookup                 |
// | ok     | 7 days since fetched, or 10 min since a try  | served as is, refreshed in the background  |
// | none   | 7 days (not at all below the matcher version)| matched again on its next lookup           |
// | failed | 10 minutes                                   | matched again on its next lookup           |
export function isMalSettled(row: RetryRow | undefined, now: Date): boolean {
  if (!row) return false;
  const since = (at: Date) => now.getTime() - at.getTime();
  if (row.status === 'ok') {
    return (
      (row.fetchedAt !== null && since(row.fetchedAt) < MAL_REFRESH_AFTER_MS) ||
      since(row.attemptedAt) < MAL_RETRY_AFTER_MS.failed
    );
  }
  if (row.status === 'none' && row.matcherVersion < MAL_MATCHER_VERSION) {
    return false;
  }
  return since(row.attemptedAt) < MAL_RETRY_AFTER_MS[row.status];
}
