export interface RateLimiter {
  // Resolves when the caller may make its request. Callers go one at a time in arrival order, `gapMs` apart.
  wait(): Promise<void>;
  // Holds every caller, queued ones included, until the pause ends. A shorter pause never cuts a longer one.
  pause(ms: number): void;
}

export interface RateLimiterOptions {
  gapMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastAt = -Infinity;
  let pausedUntil = 0;
  let queue: Promise<void> = Promise.resolve();

  // The pause is read again after each sleep, so a pause set while callers wait holds them too.
  async function take(): Promise<void> {
    for (;;) {
      const t = now();
      const at = Math.max(pausedUntil, lastAt + options.gapMs);
      if (at <= t) {
        lastAt = t;
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
