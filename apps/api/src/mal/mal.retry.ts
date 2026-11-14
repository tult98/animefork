import type { MalAiring } from '../art/contract.ts';

export type MalStatus = 'ok' | 'none' | 'failed';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// Bump when the matcher changes, so rows it rejected under the old rules are tried again.
// Version history: 2 reads the season from the slug, searches the slug romaji first and breaks part ties.
// 6 reads a Roman numeral word in the slug ("-ii-") as the season.
export const MAL_MATCHER_VERSION = 6;

export const MAL_REFRESH_AFTER_MS = 7 * DAY;
// Episodes keep coming while a show airs and its status flips when it ends, so those are checked often.
export const MAL_AIRING_REFRESH_AFTER_MS = DAY;
export const MAL_RETRY_AFTER_MS: Record<Exclude<MalStatus, 'ok'>, number> = {
  none: 7 * DAY,
  failed: 10 * MINUTE,
};

interface RetryRow {
  status: MalStatus;
  matcherVersion: number;
  attemptedAt: Date;
  fetchedAt: Date | null;
  airing?: MalAiring | null;
  datesKnown?: boolean;
}

// | status | settled for                                  | then                                       |
// | ------ | -------------------------------------------- | ------------------------------------------ |
// | (none) | not at all                                   | matched on its next lookup                 |
// | ok     | 7 days since fetched (1 day while airing), or 10 min since a try | served as is, refreshed in the background  |
// | none   | 7 days (not at all below the matcher version)| matched again on its next lookup           |
// | failed | 10 minutes                                   | matched again on its next lookup           |
export function isMalSettled(
  row: RetryRow | undefined,
  now: Date,
  namesAt?: Date,
): boolean {
  if (!row) return false;
  const since = (at: Date) => now.getTime() - at.getTime();
  if (row.status === 'ok') {
    // Rows saved before airing status or start dates were stored lack them, and are fetched once more.
    // A row saved before airing status was stored has none, and is fetched once more to get it.
    const ttl =
      row.airing === undefined || row.airing === 'finished_airing'
        ? MAL_REFRESH_AFTER_MS
        : MAL_AIRING_REFRESH_AFTER_MS;
    return (
      (row.fetchedAt !== null &&
        row.airing !== null &&
        row.datesKnown !== false &&
        since(row.fetchedAt) < ttl) ||
      since(row.attemptedAt) < MAL_RETRY_AFTER_MS.failed
    );
  }
  if (row.status === 'none' && row.matcherVersion < MAL_MATCHER_VERSION) {
    return false;
  }
  if (namesAt && row.attemptedAt < namesAt) return false;
  return since(row.attemptedAt) < MAL_RETRY_AFTER_MS[row.status];
}
