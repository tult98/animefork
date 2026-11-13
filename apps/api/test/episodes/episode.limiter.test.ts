import { describe, expect, it } from 'vitest';
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
});
