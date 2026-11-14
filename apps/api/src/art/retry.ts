export type TitleStatus = 'matched' | 'no_match' | 'failed';
export type MissStatus = Exclude<TitleStatus, 'matched'>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const MATCHER_VERSION = 6;

export const MATCHED_REFRESH_BELOW = 2;
export const MISS_RETRY_BELOW = 6;

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

export function isFromOtherMal(
  row: { status: TitleStatus; sourceMalId: number | null },
  malId: number | null,
): boolean {
  return (
    row.status === 'matched' &&
    malId !== null &&
    row.sourceMalId !== null &&
    row.sourceMalId !== malId
  );
}

export function isSettled(row: RetryRow, now: Date, namesAt?: Date): boolean {
  if (row.status !== 'matched' && row.matcherVersion < MISS_RETRY_BELOW) {
    return false;
  }
  if (row.status !== 'matched' && namesAt && row.attemptedAt < namesAt) {
    return false;
  }
  return now.getTime() - row.attemptedAt.getTime() < RETRY_AFTER_MS[row.status];
}

export function artStatus(
  row: RetryRow | undefined,
  now: Date,
  namesAt?: Date,
): 'ready' | 'pending' | 'none' {
  if (!row || !isSettled(row, now, namesAt)) return 'pending';
  return row.status === 'matched' ? 'ready' : 'none';
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
