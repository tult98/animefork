import {
  WatchProgressEpisodesResponseSchema,
  watchProgressSlugPath,
  WATCH_PROGRESS_PATH,
  type SaveWatchProgressRequest,
  type WatchProgressEpisode,
} from '../../../../api/src/watch-progress/contract.ts';

export type SaveOutcome = 'saved' | 'unauthorized' | 'failed';

function apiUrl(path: string): string | undefined {
  const base = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
  return base ? `${base}${path}` : undefined;
}

export async function saveProgress(
  body: SaveWatchProgressRequest,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<SaveOutcome> {
  const url = apiUrl(WATCH_PROGRESS_PATH);
  if (!url) return 'failed';
  try {
    const response = await fetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive,
    });
    if (response.status === 401) return 'unauthorized';
    return response.status === 204 ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}

// Throws on any failure so the query goes to its error state and the caller falls back to no history.
export async function fetchProgress(
  slug: string,
  signal?: AbortSignal,
): Promise<WatchProgressEpisode[]> {
  const url = apiUrl(watchProgressSlugPath(slug));
  if (!url) throw new Error('VITE_API_URL is not set');
  const response = await fetch(url, { credentials: 'include', signal });
  if (response.status !== 200) {
    throw new Error(`Watch progress answered ${response.status}`);
  }
  return WatchProgressEpisodesResponseSchema.parse(await response.json()).items;
}
