export type Phase =
  'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface PlayerState {
  phase: Phase;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  error?: string;
}

export type PlayerEvent =
  | { type: 'load' }
  | { type: 'ready'; paused: boolean }
  | { type: 'playing' }
  | { type: 'pause' }
  | { type: 'waiting' }
  | { type: 'ended' }
  | { type: 'failed'; message: string }
  | { type: 'time'; time: number }
  | { type: 'duration'; duration: number }
  | { type: 'volume'; volume: number; muted: boolean }
  | { type: 'rate'; rate: number };

export const initialPlayerState: PlayerState = {
  phase: 'idle',
  time: 0,
  duration: 0,
  volume: 1,
  muted: false,
  rate: 1,
};

// The video element owns playback. These events mirror what it reported, so the reducer never
// decides on its own that something is playing.
export function playerReducer(
  state: PlayerState,
  event: PlayerEvent,
): PlayerState {
  switch (event.type) {
    case 'load':
      return {
        ...state,
        phase: 'loading',
        time: 0,
        duration: 0,
        error: undefined,
      };
    case 'ready':
      if (state.phase !== 'loading') return state;
      return { ...state, phase: event.paused ? 'paused' : 'playing' };
    case 'playing':
      return state.phase === 'error' ? state : { ...state, phase: 'playing' };
    case 'pause':
      return state.phase === 'playing' ? { ...state, phase: 'paused' } : state;
    case 'waiting':
      return state.phase === 'playing' ? { ...state, phase: 'loading' } : state;
    case 'ended':
      return state.phase === 'error' ? state : { ...state, phase: 'ended' };
    case 'failed':
      return { ...state, phase: 'error', error: event.message };
    case 'time':
      return { ...state, time: event.time };
    case 'duration':
      return { ...state, duration: event.duration };
    case 'volume':
      return { ...state, volume: event.volume, muted: event.muted };
    case 'rate':
      return { ...state, rate: event.rate };
  }
}
