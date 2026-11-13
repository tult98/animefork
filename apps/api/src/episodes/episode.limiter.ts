export interface RateLimiter {
  // Resolves when the caller may make its request. Callers are spaced `gapMs` apart in arrival order.
  wait(): Promise<void>;
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
  let nextAt = 0;
  return {
    async wait() {
      // The slot is taken before any await, so concurrent callers never share one.
      const at = Math.max(now(), nextAt);
      nextAt = at + options.gapMs;
      const delay = at - now();
      if (delay > 0) await sleep(delay);
    },
  };
}
