import { vi } from 'vitest';
import {
  WATCH_PROGRESS_PATH,
  type WatchProgressShelfItem,
} from '../../../api/src/watch-progress/contract.ts';
import { API, jsonResponse } from './auth-stub.ts';

export const progressRow = (
  slug: string,
  over: Partial<WatchProgressShelfItem> = {},
): WatchProgressShelfItem => ({
  slug,
  episodeId: '7',
  episodeLabel: 'Tập 7',
  titleName: `Phim ${slug}`,
  image: `https://img.test/${slug}.jpg`,
  seasonSlug: null,
  positionS: 720,
  durationS: 1440,
  completed: false,
  updatedAt: '2026-11-10T10:00:00.000Z',
  ...over,
});

export interface ShelfStubOptions {
  items?: WatchProgressShelfItem[];
  // Answers the shelf read instead of the items.
  respond?: () => Response | Promise<Response>;
}

// Call after stubAuth(): it answers the shelf read and hands every other request to the fetch it replaces.
export function stubProgressShelf({ items = [], respond }: ShelfStubOptions) {
  const previous = globalThis.fetch;
  const reads: { init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== `${API}${WATCH_PROGRESS_PATH}`) {
        return previous(input, init);
      }
      reads.push({ init });
      return respond ? respond() : jsonResponse(200, { items });
    },
  );
  return { reads };
}
