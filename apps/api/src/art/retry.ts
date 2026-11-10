export type TitleStatus = 'matched' | 'no_match' | 'failed';
export type MissStatus = Exclude<TitleStatus, 'matched'>;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const RETRY_AFTER_MS: Record<TitleStatus, number> = {
  matched: Number.POSITIVE_INFINITY,
  no_match: 7 * DAY,
  failed: 10 * MINUTE,
};

export const MATCHER_VERSION = 1;

export function isSettled(
  row: { status: TitleStatus; attemptedAt: Date },
  now: Date,
): boolean {
  return now.getTime() - row.attemptedAt.getTime() < RETRY_AFTER_MS[row.status];
}
