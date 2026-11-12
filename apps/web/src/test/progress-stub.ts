import { vi } from 'vitest';
import {
  WATCH_PROGRESS_PATH,
  type SaveWatchProgressRequest,
  type SaveWatchProgressResponse,
  type WatchProgressEpisode,
} from '../../../api/src/watch-progress/contract.ts';
import {
  clampPosition,
  isCompleted,
} from '../../../api/src/watch-progress/watch-progress.ts';
import { API, jsonResponse } from './auth-stub.ts';

export interface ProgressStubOptions {
  /** Rows per title slug; a slug without an entry has none. */
  rows?: Record<string, WatchProgressEpisode[]>;
  /** Answers every row read with this status instead of the rows. */
  rowsStatus?: number;
  /** Row reads answer only once this settles. */
  gate?: Promise<void>;
  /** Answers a save; the default is 200 with the row the real API would store. */
  put?: (
    body: SaveWatchProgressRequest,
    call: number,
  ) => Response | Promise<Response>;
}

export function storedRow(
  body: SaveWatchProgressRequest,
): SaveWatchProgressResponse {
  const positionS = clampPosition(body.positionS, body.durationS);
  return {
    episodeId: body.episodeId,
    positionS,
    durationS: body.durationS,
    completed: isCompleted(positionS, body.durationS),
  };
}

// Call after stubAuth(): it answers the watch-progress routes and hands every other request to the fetch it replaces.
export function stubProgress({
  rows = {},
  rowsStatus,
  gate,
  put = (body) => jsonResponse(200, storedRow(body)),
}: ProgressStubOptions = {}) {
  const previous = globalThis.fetch;
  const saves: { body: SaveWatchProgressRequest; init: RequestInit }[] = [];
  const reads: string[] = [];
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (!url.startsWith(`${API}${WATCH_PROGRESS_PATH}`)) {
        return previous(input, init);
      }
      if (init.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as SaveWatchProgressRequest;
        saves.push({ body, init });
        return put(body, saves.length);
      }
      const slug = decodeURIComponent(
        url.slice(`${API}${WATCH_PROGRESS_PATH}/`.length),
      );
      reads.push(slug);
      await gate;
      return rowsStatus
        ? jsonResponse(rowsStatus, { error: 'unauthenticated' })
        : jsonResponse(200, { items: rows[slug] ?? [] });
    },
  );
  return { saves, reads };
}
