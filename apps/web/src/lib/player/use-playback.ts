import { useCallback, useEffect, useReducer, useRef } from 'react';
import { attachStream } from './attach-stream.ts';
import { usePlayerSource } from './context.tsx';
import { seekTarget } from '../progress/resume.ts';
import { initialPlayerState, playerReducer } from './state.ts';
import type { StreamRequest } from './source.ts';

export interface PlaybackControls {
  toggle(): void;
  seek(seconds: number): void;
  skip(delta: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  setRate(rate: number): void;
  retry(): void;
}

// `startAtS` is where the viewer left this episode. It is read when the stream loads, so a change to it
// alone neither reloads the stream nor seeks.
export function usePlayback(episode: StreamRequest | undefined, startAtS = 0) {
  const source = usePlayerSource();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  const startAt = useRef(startAtS);
  useEffect(() => {
    startAt.current = startAtS;
  }, [startAtS]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const listeners: [string, () => void][] = [
      ['canplay', () => dispatch({ type: 'ready', paused: video.paused })],
      ['playing', () => dispatch({ type: 'playing' })],
      ['pause', () => dispatch({ type: 'pause' })],
      ['waiting', () => dispatch({ type: 'waiting' })],
      ['ended', () => dispatch({ type: 'ended' })],
      ['timeupdate', () => dispatch({ type: 'time', time: video.currentTime })],
      ['seeked', () => dispatch({ type: 'time', time: video.currentTime })],
      [
        'durationchange',
        () => dispatch({ type: 'duration', duration: video.duration }),
      ],
      [
        'volumechange',
        () =>
          dispatch({
            type: 'volume',
            volume: video.volume,
            muted: video.muted,
          }),
      ],
      [
        'ratechange',
        () => dispatch({ type: 'rate', rate: video.playbackRate }),
      ],
      [
        'error',
        () =>
          dispatch({
            type: 'failed',
            message: video.error?.message || 'media error',
          }),
      ],
    ];
    for (const [type, listener] of listeners) {
      video.addEventListener(type, listener);
    }
    return () => {
      for (const [type, listener] of listeners) {
        video.removeEventListener(type, listener);
      }
    };
  }, []);

  const { id, play, hash } = episode ?? {};
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !id || !play || !hash) return;
    const abort = new AbortController();
    let teardown: (() => void) | undefined;
    dispatch({ type: 'load' });
    // A seek before the video can play may be ignored, so it waits for canplay. This listener is added after
    // the state listener above, so the state has already settled when the position jumps.
    const resume = () => {
      if (startAt.current > 0) video.currentTime = seekTarget(startAt.current);
    };
    video.addEventListener('canplay', resume, { once: true });
    void (async () => {
      try {
        const stream = await source.resolve({ id, play, hash }, abort.signal);
        if (abort.signal.aborted) return;
        teardown = await attachStream(video, stream, {
          onFatal: (message) => dispatch({ type: 'failed', message }),
        });
        if (abort.signal.aborted) {
          teardown();
          return;
        }
        // Autoplay can be refused by the browser. The state then settles on paused and the viewer presses play.
        await video.play().catch(() => undefined);
      } catch (error) {
        if (abort.signal.aborted) return;
        dispatch({
          type: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      video.removeEventListener('canplay', resume);
      abort.abort();
      teardown?.();
    };
  }, [source, id, play, hash, attempt]);

  const controls: PlaybackControls = {
    toggle: useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused || video.ended) void video.play().catch(() => undefined);
      else video.pause();
    }, []),
    seek: useCallback((seconds) => {
      const video = videoRef.current;
      if (video) video.currentTime = seconds;
    }, []),
    skip: useCallback((delta) => {
      const video = videoRef.current;
      if (!video) return;
      const end = Number.isFinite(video.duration) ? video.duration : Infinity;
      video.currentTime = Math.min(end, Math.max(0, video.currentTime + delta));
    }, []),
    setVolume: useCallback((volume) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = Math.min(1, Math.max(0, volume));
      video.muted = false;
    }, []),
    toggleMute: useCallback(() => {
      const video = videoRef.current;
      if (video) video.muted = !video.muted;
    }, []),
    setRate: useCallback((rate) => {
      const video = videoRef.current;
      if (video) video.defaultPlaybackRate = video.playbackRate = rate;
    }, []),
    retry,
  };

  return { videoRef, state, controls };
}
