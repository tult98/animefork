// Jikan allows 3 requests a second and 60 a minute, and answers 429 past either.
// The gap keeps the steady rate near 40 a minute, well under both limits.
export const JIKAN_GAP_MS = 1500;
// Jikan's own 429s from upstream MAL can land inside the quota, so the window stays under its 60 a minute.
export const JIKAN_WINDOW_MS = 60_000;
export const JIKAN_MAX_PER_WINDOW = 50;

export interface JikanLimiter {
  // Resolves when the caller may make its request. Callers go one at a time in arrival order.
  wait(): Promise<void>;
  // Holds every caller, queued ones included, until the pause ends. A shorter pause never cuts a longer one.
  pause(ms: number): void;
}

export interface JikanLimiterOptions {
  gapMs?: number;
  windowMs?: number;
  maxPerWindow?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createJikanLimiter(
  options: JikanLimiterOptions = {},
): JikanLimiter {
  const gapMs = options.gapMs ?? JIKAN_GAP_MS;
  const windowMs = options.windowMs ?? JIKAN_WINDOW_MS;
  const maxPerWindow = options.maxPerWindow ?? JIKAN_MAX_PER_WINDOW;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const calls: number[] = [];
  let pausedUntil = 0;
  let queue: Promise<void> = Promise.resolve();

  async function take(): Promise<void> {
    for (;;) {
      const t = now();
      while (calls.length > 0 && t - (calls[0] ?? 0) >= windowMs) calls.shift();
      let at = Math.max(pausedUntil, (calls.at(-1) ?? -Infinity) + gapMs);
      if (calls.length >= maxPerWindow) {
        at = Math.max(at, (calls[0] ?? 0) + windowMs);
      }
      if (at <= t) {
        calls.push(t);
        return;
      }
      await sleep(at - t);
    }
  }

  return {
    wait() {
      const turn = queue.then(take);
      queue = turn.catch(() => undefined);
      return turn;
    },
    pause(ms) {
      pausedUntil = Math.max(pausedUntil, now() + ms);
    },
  };
}
