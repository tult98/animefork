export type TitleStatus = 'matched' | 'no_match' | 'failed';
export type MissStatus = Exclude<TitleStatus, 'matched'>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const RETRY_AFTER_MS: Record<TitleStatus, number> = {
  matched: Number.POSITIVE_INFINITY,
  no_match: 7 * DAY,
  failed: 10 * MINUTE,
};

// Version 2 added the TMDB poster. Matched rows from an older version refill in the background.
export const MATCHER_VERSION = 2;

export function isStale(row: {
  status: TitleStatus;
  matcherVersion: number;
}): boolean {
  return row.status === 'matched' && row.matcherVersion < MATCHER_VERSION;
}

export function isSettled(
  row: { status: TitleStatus; attemptedAt: Date },
  now: Date,
): boolean {
  return now.getTime() - row.attemptedAt.getTime() < RETRY_AFTER_MS[row.status];
}
