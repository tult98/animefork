import type {
  SaveWatchProgressRequest,
  WatchProgressEpisode,
} from '../../../../api/src/watch-progress/contract.ts';
import type { SaveOutcome } from './client.ts';

export const SAVE_INTERVAL_MS = 15_000;

export type SaveMeta = Omit<
  SaveWatchProgressRequest,
  'positionS' | 'durationS'
>;

export interface Snapshot {
  positionS: number;
  durationS: number;
}

interface SaverOptions {
  meta: SaveMeta;
  // Null while there is nothing trustworthy to save, such as before the video knows its duration.
  read: () => Snapshot | null;
  send: (
    body: SaveWatchProgressRequest,
    options: { keepalive: boolean },
  ) => Promise<SaveOutcome>;
  onSaved?: (row: WatchProgressEpisode) => void;
  onUnauthorized?: () => void;
  intervalMs?: number;
}

// The server keeps whichever write arrives last, so two saves must never be in flight together:
// one runs, and later requests collapse into a single pending latest that goes out when it settles.
export function createSaver(options: SaverOptions) {
  const { meta, read, send, intervalMs = SAVE_INTERVAL_MS } = options;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight = false;
  let pending: { body: SaveWatchProgressRequest; keepalive: boolean } | null =
    null;
  let stopped = false;

  async function drain() {
    if (inFlight) return;
    inFlight = true;
    while (pending && !stopped) {
      const { body, keepalive } = pending;
      pending = null;
      const outcome = await send(body, { keepalive });
      if (outcome.kind === 'unauthorized') {
        stopped = true;
        pending = null;
        stopTimer();
        options.onUnauthorized?.();
      } else if (outcome.kind === 'saved') {
        options.onSaved?.(outcome.row);
      }
    }
    inFlight = false;
  }

  function stopTimer() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  function save({ keepalive = false }: { keepalive?: boolean } = {}) {
    if (stopped) return;
    const snapshot = read();
    if (
      !snapshot ||
      !Number.isFinite(snapshot.durationS) ||
      snapshot.durationS <= 0 ||
      !Number.isFinite(snapshot.positionS)
    ) {
      return;
    }
    const positionS = Math.min(
      Math.max(0, snapshot.positionS),
      snapshot.durationS,
    );
    pending = {
      body: { ...meta, positionS, durationS: snapshot.durationS },
      // A keepalive request already queued must not lose that flag to a later plain one.
      keepalive: keepalive || (pending?.keepalive ?? false),
    };
    void drain();
  }

  return {
    save,
    // The interval counts playing time only, so pausing stops it and playing starts a fresh 15 s.
    setPlaying(playing: boolean) {
      stopTimer();
      if (playing && !stopped) timer = setInterval(() => save(), intervalMs);
    },
    dispose: stopTimer,
  };
}

export type Saver = ReturnType<typeof createSaver>;
