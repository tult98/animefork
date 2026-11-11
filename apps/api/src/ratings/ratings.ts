export const AVS_REFRESH_AFTER_MS = 7 * 24 * 60 * 60_000;

// A client may overwrite a row only when its last write is older than this, so a bad client cannot churn a fresh one.
export const AVS_MIN_REWRITE_MS = 60 * 60_000;

export interface StoredRatings {
  slug: string;
  avsScore: number | null;
  avsVoters: number | null;
  avsFetchedAt: Date | null;
  quality: string | null;
}

export function isAvsStale(row: StoredRatings | undefined, now: Date): boolean {
  if (!row?.avsFetchedAt) return true;
  return now.getTime() - row.avsFetchedAt.getTime() >= AVS_REFRESH_AFTER_MS;
}
