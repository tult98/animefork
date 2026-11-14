import { useEffect, useRef, useState } from 'react';
import { useTrailerMuted } from '../lib/ui/trailer-sound.ts';
import { loadYouTubeApi, type YouTubePlayer } from '../lib/ui/youtube.ts';

// An error counts as 'ended': either way the image under the trailer shows again.
export type TrailerPhase = 'loading' | 'playing' | 'ended';

// YouTube draws its title bar and pause button over a video for about 4s after each start. Measured: gone by 4.1s after PLAYING.
const START_OVERLAY_MS = 5000;

const MAX_START_OVERSIZE = 20;
// Under the GPU's max texture size (16384 on most): a larger layer is drawn in tiles, so the video wipes in instead of fading.
const MAX_LAYER_DEVICE_PX = 15000;

// How many times larger the player is laid out while YouTube's start overlay shows.
export function startOversize(
  boxWidth: number,
  boxHeight: number,
  devicePixelRatio: number,
): number {
  const width = Math.max(boxWidth, (boxHeight * 16) / 9);
  const height = Math.max(boxHeight, (boxWidth * 9) / 16);
  const longest = Math.max(width, height) * devicePixelRatio;
  return Math.max(
    1,
    Math.min(MAX_START_OVERSIZE, MAX_LAYER_DEVICE_PX / longest),
  );
}

function playerVars(): Record<string, string | number> {
  return {
    autoplay: 1,
    mute: 1,
    controls: 0,
    playsinline: 1,
    rel: 0,
    modestbranding: 1,
    disablekb: 1,
    fs: 0,
    cc_load_policy: 0,
    iv_load_policy: 3,
    origin: window.location.origin,
  };
}

// Plays over the image it is placed on, which stays visible until the video plays and again once it ends, unless it loops.
export function Trailer({
  youtubeId,
  loop = false,
  onPhase,
  testId = 'trailer',
}: {
  youtubeId: string;
  loop?: boolean;
  onPhase?: (phase: TrailerPhase) => void;
  testId?: string;
}) {
  const muted = useTrailerMuted();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const mutedRef = useRef(muted);
  const onPhaseRef = useRef(onPhase);
  const [phase, setPhase] = useState<TrailerPhase>('loading');
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    mutedRef.current = muted;
    onPhaseRef.current = onPhase;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let gone = false;
    let player: YouTubePlayer | undefined;
    let settleTimer: number | undefined;
    const report = (next: TrailerPhase) => {
      if (gone) return;
      setPhase(next);
      onPhaseRef.current?.(next);
    };
    report('loading');
    setSettled(false);
    const box = host.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      host.style.setProperty(
        '--start-oversize',
        String(startOversize(box.width, box.height, window.devicePixelRatio)),
      );
    }
    loadYouTubeApi().then(
      (YT) => {
        if (gone) return;
        // The API swaps its target element for an iframe, so it gets one React does not own.
        const target = document.createElement('div');
        host.append(target);
        player = new YT.Player(target, {
          videoId: youtubeId,
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: playerVars(),
          events: {
            onReady: ({ target: ready }) => {
              playerRef.current = ready;
              ready.getIframe().tabIndex = -1;
              // YouTube can carry an unmute over from an earlier player, so the start state is set, not assumed.
              if (mutedRef.current) ready.mute();
              else ready.unMute();
            },
            onStateChange: ({ data, target: playing }) => {
              if (data === YT.PlayerState.PLAYING) {
                report('playing');
                settleTimer ??= window.setTimeout(
                  () => setSettled(true),
                  START_OVERLAY_MS,
                );
              } else if (data === YT.PlayerState.ENDED && !loop) {
                report('ended');
              } else if (data === YT.PlayerState.ENDED) {
                window.clearTimeout(settleTimer);
                settleTimer = undefined;
                setSettled(false);
                playing.seekTo(0, true);
                playing.playVideo();
              }
            },
            onError: () => report('ended'),
          },
        });
      },
      () => report('ended'),
    );
    return () => {
      gone = true;
      window.clearTimeout(settleTimer);
      playerRef.current = null;
      player?.destroy();
      host.replaceChildren();
    };
  }, [youtubeId, loop]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (muted) player.mute();
    else player.unMute();
  }, [muted]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-phase={phase}
      data-settled={settled ? '' : undefined}
      data-testid={testId}
      className="video-cover trailer"
    />
  );
}
