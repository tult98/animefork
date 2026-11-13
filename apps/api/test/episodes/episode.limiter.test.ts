import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '../../src/episodes/episode.limiter.ts';

describe('createRateLimiter', () => {
  it('spaces simultaneous callers one gap apart', async () => {
    let t = 1000;
    const slept: number[] = [];
    const limiter = createRateLimiter({
      gapMs: 1000,
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms);
        t += ms;
      },
    });

    await Promise.all([limiter.wait(), limiter.wait(), limiter.wait()]);

    expect(slept).toEqual([1000, 1000]);
    expect(t).toBe(3000);
  });

  it('holds a caller already waiting when a pause starts', async () => {
    let t = 0;
    const wakes: (() => void)[] = [];
    const limiter = createRateLimiter({
      gapMs: 1000,
      now: () => t,
      sleep: (ms) =>
        new Promise((resolve) => {
          wakes.push(() => {
            t += ms;
            resolve();
          });
        }),
    });
    await limiter.wait();
    let releasedAt = -1;
    const queued = limiter.wait().then(() => (releasedAt = t));
    await vi.waitFor(() => expect(wakes).toHaveLength(1));

    limiter.pause(60_000);
    while (releasedAt < 0) {
      wakes.shift()?.();
      await new Promise((r) => setImmediate(r));
    }
    await queued;

    expect(releasedAt).toBe(60_000);
  });
});
