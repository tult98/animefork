import { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi, type YouTubePlayer } from '../lib/ui/youtube.ts';

// An error counts as 'ended': either way the image under the trailer shows again.
export type TrailerPhase = 'loading' | 'playing' | 'ended';

function playerVars(): Record<string, string | number> {
  return {
    autoplay: 1,
    mute: 1,
    controls: 0,
    playsinline: 1,
    rel: 0,
    modestbranding: 1,
    disablekb: 1,
    iv_load_policy: 3,
    origin: window.location.origin,
  };
}

// Plays once over the image it is placed on, which stays visible until the video plays and again once it ends.
export function Trailer({
  youtubeId,
  muted,
  onPhase,
}: {
  youtubeId: string;
  muted: boolean;
  onPhase?: (phase: TrailerPhase) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const mutedRef = useRef(muted);
  const onPhaseRef = useRef(onPhase);
  const [phase, setPhase] = useState<TrailerPhase>('loading');

  useEffect(() => {
    mutedRef.current = muted;
    onPhaseRef.current = onPhase;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let gone = false;
    let player: YouTubePlayer | undefined;
    const report = (next: TrailerPhase) => {
      if (gone) return;
      setPhase(next);
      onPhaseRef.current?.(next);
    };
    report('loading');
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
              if (!mutedRef.current) ready.unMute();
            },
            onStateChange: ({ data }) => {
              if (data === YT.PlayerState.PLAYING) report('playing');
              else if (data === YT.PlayerState.ENDED) report('ended');
            },
            onError: () => report('ended'),
          },
        });
      },
      () => report('ended'),
    );
    return () => {
      gone = true;
      playerRef.current = null;
      player?.destroy();
      host.replaceChildren();
    };
  }, [youtubeId]);

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
      data-testid="trailer"
      className="trailer"
    />
  );
}
