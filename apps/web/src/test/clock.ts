import { act } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Fake time that still ticks along with real time, so fetches, queries and Testing Library's waits keep working
// while advance() jumps over a poll delay.
export function withFakeClock() {
  beforeEach(() => void vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => void vi.useRealTimers());
}

export const advance = (ms: number) =>
  act(() => vi.advanceTimersByTimeAsync(ms));
