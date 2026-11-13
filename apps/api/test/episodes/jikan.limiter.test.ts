import { describe, expect, it } from 'vitest';
import { createJikanLimiter } from '../../src/episodes/jikan.limiter.ts';

function clock() {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('createJikanLimiter', () => {
  it('spaces calls at least the gap apart', async () => {
    const { now, sleep } = clock();
    const limiter = createJikanLimiter({ gapMs: 1500, now, sleep });
    const at: number[] = [];
    await Promise.all(
      [0, 1, 2].map(async () => {
        await limiter.wait();
        at.push(now());
      }),
    );
    expect(at.map((t, i) => t - (at[i - 1] ?? t - 1500))).toEqual([
      1500, 1500, 1500,
    ]);
  });

  it('makes the 51st call within a minute wait for the window to clear', async () => {
    const { now, sleep } = clock();
    const limiter = createJikanLimiter({ gapMs: 100, now, sleep });
    const start = now();
    for (let i = 0; i < 50; i++) await limiter.wait();
    expect(now() - start).toBe(49 * 100);

    await limiter.wait();

    expect(now() - start).toBe(60_000);
  });

  it('holds queued calls while paused', async () => {
    const { now, sleep } = clock();
    const limiter = createJikanLimiter({ gapMs: 100, now, sleep });
    await limiter.wait();
    const start = now();

    limiter.pause(30_000);
    limiter.pause(5_000);
    await limiter.wait();

    expect(now() - start).toBe(30_000);
  });
});
