import { describe, expect, it } from 'vitest';
import {
  initialPlayerState,
  playerReducer,
  type PlayerEvent,
  type PlayerState,
} from '../state.ts';

const run = (events: PlayerEvent[], from: PlayerState = initialPlayerState) =>
  events.reduce(playerReducer, from);

describe('playerReducer', () => {
  it('starts idle and moves to loading when an episode loads', () => {
    expect(initialPlayerState.phase).toBe('idle');
    expect(run([{ type: 'load' }]).phase).toBe('loading');
  });

  it('goes loading to paused when the video can play but is not running', () => {
    expect(run([{ type: 'load' }, { type: 'ready', paused: true }]).phase).toBe(
      'paused',
    );
  });

  it('goes loading to playing when autoplay already started', () => {
    expect(
      run([{ type: 'load' }, { type: 'ready', paused: false }]).phase,
    ).toBe('playing');
  });

  it('ignores canplay after loading finished', () => {
    const state = run([{ type: 'load' }, { type: 'playing' }]);
    expect(playerReducer(state, { type: 'ready', paused: true }).phase).toBe(
      'playing',
    );
  });

  it('plays, pauses and buffers', () => {
    const playing = run([{ type: 'load' }, { type: 'playing' }]);
    expect(playing.phase).toBe('playing');
    expect(playerReducer(playing, { type: 'pause' }).phase).toBe('paused');
    expect(playerReducer(playing, { type: 'waiting' }).phase).toBe('loading');
  });

  it('keeps ended when the pause that precedes it arrives', () => {
    const state = run([
      { type: 'load' },
      { type: 'playing' },
      { type: 'pause' },
      { type: 'ended' },
    ]);
    expect(state.phase).toBe('ended');
  });

  it('replays from ended', () => {
    expect(run([{ type: 'ended' }, { type: 'playing' }]).phase).toBe('playing');
  });

  it('holds the error until the next load clears it', () => {
    const failed = run([{ type: 'load' }, { type: 'failed', message: 'x' }]);
    expect(failed).toMatchObject({ phase: 'error', error: 'x' });
    expect(playerReducer(failed, { type: 'playing' }).phase).toBe('error');
    expect(playerReducer(failed, { type: 'load' })).toMatchObject({
      phase: 'loading',
      error: undefined,
    });
  });

  it('resets time and duration on a new load but keeps volume and rate', () => {
    const state = run([
      { type: 'duration', duration: 60 },
      { type: 'time', time: 12 },
      { type: 'volume', volume: 0.3, muted: true },
      { type: 'rate', rate: 1.5 },
      { type: 'load' },
    ]);
    expect(state).toMatchObject({
      time: 0,
      duration: 0,
      volume: 0.3,
      muted: true,
      rate: 1.5,
    });
  });
});
