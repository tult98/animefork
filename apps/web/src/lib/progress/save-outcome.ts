import { ApiError } from '../api/client.ts';
import {
  SaveWatchProgressResponseSchema,
  type WatchProgressEpisode,
} from '../../../../api/src/watch-progress/contract.ts';

export type SaveOutcome =
  | { kind: 'saved'; row: WatchProgressEpisode }
  | { kind: 'unauthorized' }
  | { kind: 'failed' };

const FAILED: SaveOutcome = { kind: 'failed' };

export async function toSaveOutcome(
  save: Promise<unknown>,
): Promise<SaveOutcome> {
  try {
    const parsed = SaveWatchProgressResponseSchema.safeParse(await save);
    return parsed.success ? { kind: 'saved', row: parsed.data } : FAILED;
  } catch (error) {
    return error instanceof ApiError && error.status === 401
      ? { kind: 'unauthorized' }
      : FAILED;
  }
}
