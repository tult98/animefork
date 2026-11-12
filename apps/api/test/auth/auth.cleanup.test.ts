import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAuthConfig } from '../../src/auth/auth.config.ts';
import { AuthService } from '../../src/auth/auth.service.ts';
import { MemoryAuthStore } from '../../src/auth/auth.store.ts';
import { FakeMailer } from '../../src/auth/mailer.ts';
import { systemClock } from '../../src/common/clock.ts';

function service(store: MemoryAuthStore, everyMs: number | null) {
  return new AuthService(
    store,
    new FakeMailer(),
    loadAuthConfig({}),
    systemClock,
    everyMs,
  );
}

describe('auth cleanup timer', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs the cleanup on its interval, never holds the process open, and stops on destroy', async () => {
    vi.useFakeTimers();
    const store = new MemoryAuthStore();
    const deleteStale = vi.spyOn(store, 'deleteStale');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const auth = service(store, 1000);
    auth.onModuleInit();
    const timer = setIntervalSpy.mock.results[0]?.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);

    await vi.advanceTimersByTimeAsync(2500);
    expect(deleteStale).toHaveBeenCalledTimes(2);

    auth.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(deleteStale).toHaveBeenCalledTimes(2);
  });

  it('starts no timer when the interval is null', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    service(new MemoryAuthStore(), null).onModuleInit();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('keeps the timer alive when a cleanup fails', async () => {
    vi.useFakeTimers();
    const store = new MemoryAuthStore();
    const deleteStale = vi
      .spyOn(store, 'deleteStale')
      .mockRejectedValue(new Error('db down'));
    const auth = service(store, 1000);
    auth.onModuleInit();
    await vi.advanceTimersByTimeAsync(2500);
    expect(deleteStale).toHaveBeenCalledTimes(2);
    auth.onModuleDestroy();
  });
});
