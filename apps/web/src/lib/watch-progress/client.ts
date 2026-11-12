import {
  WATCH_PROGRESS_PATH,
  WatchProgressShelfResponseSchema,
  type WatchProgressShelfItem,
} from '../../../../api/src/watch-progress/contract.ts';

// A 401, a network failure, an unset VITE_API_URL and a body of an unexpected shape all throw, so the caller can drop the row.
export async function fetchContinueRows(
  signal?: AbortSignal,
): Promise<WatchProgressShelfItem[]> {
  const base = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
  if (!base) throw new Error('VITE_API_URL is not set');
  const response = await fetch(`${base}${WATCH_PROGRESS_PATH}`, {
    credentials: 'include',
    signal,
  });
  if (response.status !== 200) {
    throw new Error(`watch progress shelf answered ${response.status}`);
  }
  return WatchProgressShelfResponseSchema.parse(await response.json()).items;
}
