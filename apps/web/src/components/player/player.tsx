import { useRef, type ReactNode } from 'react';
import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { formatClock } from '../../lib/player/format.ts';
import {
  activeSegment,
  showsOutroCard,
} from '../../lib/player/skip-segments.ts';
import { useSkipSegments } from '../../lib/player/use-skip-segments.ts';
import { usePlayback } from '../../lib/player/use-playback.ts';
import { useProgressSaving } from '../../lib/progress/use-progress-saving.ts';
import type { Episode } from '../../lib/titles/watch.ts';
import {
  ArrowLeft,
  ListVideo,
  Gauge,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  TriangleAlert,
} from '../ui/icons.ts';
import { Button } from '../ui/button.tsx';
import { HoverPopup } from './hover-popup.tsx';
import { IconButton } from './icon-button.tsx';
import { NextEpisode, type NextEpisodeInfo } from './next-episode.tsx';
import { Scrubber } from './scrubber.tsx';
import { SkipButton } from './skip-button.tsx';
import { SpeedPanel } from './speed-panel.tsx';
import { useFullscreen } from './use-fullscreen.ts';
import { useIdle } from './use-idle.ts';
import { usePlayerKeys } from './use-player-keys.ts';
import { VolumeControl } from './volume-control.tsx';
import './player.css';

const SKIP_SECONDS = 10;

interface PlayerProps {
  slug: string;
  seasonSlug: string;
  title: string;
  seasonName?: string;
  episode: Episode;
  image?: string;
  startS: number;
  nextEpisode?: NextEpisodeInfo;
  onNext?: () => void;
  onBack: () => void;
  episodesPanel: (progress: number, close: () => void) => ReactNode;
}

function SkipGlyph({ forward }: { forward: boolean }) {
  const Arrow = forward ? RotateCw : RotateCcw;
  return (
    <span className="relative inline-flex">
      <Arrow aria-hidden="true" />
      <span
        aria-hidden="true"
        className="absolute inset-0 grid place-items-center pt-0.5 text-[8px] leading-none font-bold"
      >
        {SKIP_SECONDS}
      </span>
    </span>
  );
}

export function Player({
  slug,
  seasonSlug,
  title,
  seasonName,
  episode,
  image,
  startS,
  nextEpisode,
  onNext,
  onBack,
  episodesPanel,
}: PlayerProps) {
  const root = useRef<HTMLDivElement>(null);
  const { videoRef, state, controls } = usePlayback(episode, startS);
  useProgressSaving(videoRef, {
    slug,
    seasonSlug,
    episodeId: episode.id,
    titleName: title,
    image,
    episodeLabel: episode.label,
  });
  const skipSegments = useSkipSegments(slug, episode.label);
  const fullscreen = useFullscreen(root);
  usePlayerKeys({
    controls,
    duration: state.duration,
    volume: state.volume,
    toggleFullscreen: fullscreen.toggle,
  });

  const playing = state.phase === 'playing';
  const idle = useIdle(root, playing);
  const playLabel = playing ? PLAYER_COPY.pause : PLAYER_COPY.play;
  const outroCard = showsOutroCard(
    activeSegment(skipSegments, state.time),
    !!nextEpisode && !!onNext,
  );
  const progress = state.duration > 0 ? (state.time / state.duration) * 100 : 0;

  return (
    <div
      ref={root}
      data-testid="player"
      data-state={state.phase}
      data-idle={idle}
      className="relative h-dvh min-h-[520px] w-full overflow-hidden bg-black text-ink"
    >
      <video
        ref={videoRef}
        data-testid="player:video"
        className="absolute inset-0 size-full bg-black object-contain"
        playsInline
        preload="auto"
      />

      <button
        type="button"
        aria-label={playLabel}
        data-testid="player:stage"
        className="absolute inset-0 size-full cursor-default border-0 bg-transparent p-0 in-data-[idle=true]:cursor-none"
        onClick={controls.toggle}
      />

      {state.phase === 'loading' ? (
        <div
          role="status"
          aria-label={PLAYER_COPY.loading}
          data-testid="player:loading"
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <LoaderCircle aria-hidden="true" className="size-12 animate-spin" />
        </div>
      ) : null}

      {state.phase === 'error' ? (
        <div
          role="alert"
          data-testid="player:error"
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 text-center"
        >
          <TriangleAlert aria-hidden="true" className="size-10 text-muted" />
          <p className="text-title-sm">{PLAYER_COPY.failed}</p>
          <Button
            kind="pill"
            tone="brand"
            data-testid="player:retry"
            onClick={controls.retry}
          >
            {PLAYER_COPY.retry}
          </Button>
        </div>
      ) : null}

      <div
        aria-hidden="true"
        className="pl-chrome pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--canvas)_85%,transparent),transparent)]"
      />
      <div className="pl-chrome pointer-events-none absolute inset-x-gutter top-7 z-1 flex items-center gap-4 max-[720px]:inset-x-4">
        <IconButton
          small
          label={PLAYER_COPY.back}
          data-testid="player:back"
          className="pointer-events-auto"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
        </IconButton>
        <div className="min-w-0">
          <div data-testid="player:title" className="truncate text-title-sm">
            {title}
          </div>
          <div className="truncate text-sm font-medium text-muted">
            {seasonName ? `${seasonName} · ` : null}
            <span data-testid="player:episode-label">{episode.label}</span>
            {episode.name ? (
              <>
                {': '}
                <span data-testid="player:episode-name">{episode.name}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pl-bar pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 px-gutter pt-24 pb-7 max-[720px]:px-4">
        <div
          aria-hidden="true"
          className="pl-chrome absolute inset-0 bg-[linear-gradient(to_top,var(--hero-overlay),transparent),linear-gradient(to_top,var(--hero-overlay),transparent_70%)]"
        />
        <SkipButton
          segments={skipSegments}
          time={state.time}
          duration={state.duration}
          image={image}
          nextEpisode={nextEpisode}
          onSkip={controls.seek}
          onNext={onNext}
        />
        <div className="pl-chrome relative flex flex-col gap-1">
          <div className="pl-timeline pointer-events-auto flex items-center gap-4">
            <Scrubber
              time={state.time}
              duration={state.duration}
              segments={skipSegments}
              onSeek={controls.seek}
            />
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <IconButton
                label={playLabel}
                data-testid="player:play"
                aria-keyshortcuts="k Space"
                onClick={controls.toggle}
              >
                {playing ? (
                  <Pause
                    aria-hidden="true"
                    className="fill-current stroke-none"
                  />
                ) : (
                  <Play
                    aria-hidden="true"
                    className="fill-current stroke-none"
                  />
                )}
              </IconButton>
              <IconButton
                label={PLAYER_COPY.back10}
                data-testid="player:back10"
                onClick={() => controls.skip(-SKIP_SECONDS)}
              >
                <SkipGlyph forward={false} />
              </IconButton>
              <IconButton
                label={PLAYER_COPY.forward10}
                data-testid="player:forward10"
                onClick={() => controls.skip(SKIP_SECONDS)}
              >
                <SkipGlyph forward />
              </IconButton>
              <VolumeControl
                volume={state.volume}
                muted={state.muted}
                onVolume={controls.setVolume}
                onToggleMute={controls.toggleMute}
              />
              <span
                data-testid="player:time"
                className="ml-2 text-sm font-medium tabular-nums"
              >
                {formatClock(state.time)}
                <span className="text-muted">
                  {' / '}
                  {formatClock(state.duration)}
                </span>
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <NextEpisode
                next={outroCard ? undefined : nextEpisode}
                image={image}
                onNext={onNext}
              />
              <HoverPopup
                id="episodes"
                label={PLAYER_COPY.episodes}
                icon={<ListVideo aria-hidden="true" />}
                width={408}
              >
                {({ close }) => episodesPanel(progress, close)}
              </HoverPopup>
              <HoverPopup
                id="speed"
                label={PLAYER_COPY.speed}
                icon={<Gauge aria-hidden="true" />}
                width={220}
              >
                <SpeedPanel rate={state.rate} onPick={controls.setRate} />
              </HoverPopup>
              <IconButton
                label={
                  fullscreen.active
                    ? PLAYER_COPY.exitFullscreen
                    : PLAYER_COPY.fullscreen
                }
                data-testid="player:fullscreen"
                aria-keyshortcuts="f"
                data-active={fullscreen.active}
                onClick={fullscreen.toggle}
              >
                {fullscreen.active ? (
                  <Minimize aria-hidden="true" />
                ) : (
                  <Maximize aria-hidden="true" />
                )}
              </IconButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
