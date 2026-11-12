import { apiFetch } from '../api/request.ts';
import {
  SaveWatchProgressResponseSchema,
  WATCH_PROGRESS_PATH,
  type SaveWatchProgressRequest,
  type WatchProgressEpisode,
} from '../../../../api/src/watch-progress/contract.ts';

export type SaveOutcome =
  | { kind: 'saved'; row: WatchProgressEpisode }
  | { kind: 'unauthorized' }
  | { kind: 'failed' };

const FAILED: SaveOutcome = { kind: 'failed' };

export async function saveProgress(
  body: SaveWatchProgressRequest,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<SaveOutcome> {
  try {
    const response = await apiFetch(WATCH_PROGRESS_PATH, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive,
    });
    if (response.status === 401) return { kind: 'unauthorized' };
    if (response.status !== 200) return FAILED;
    const parsed = SaveWatchProgressResponseSchema.safeParse(
      await response.json(),
    );
    return parsed.success ? { kind: 'saved', row: parsed.data } : FAILED;
  } catch {
    return FAILED;
  }
}
