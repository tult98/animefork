import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { episodeTitle } from '../../lib/player/format.ts';
import {
  activeSegment,
  outroCountdown,
  showsOutroCard,
  type SkipSegment,
} from '../../lib/player/skip-segments.ts';
import { Button } from '../ui/button.tsx';
import { SkipForward } from '../ui/icons.ts';
import type { NextEpisodeInfo } from './next-episode.tsx';
import { NextThumb } from './next-thumb.tsx';

interface SkipButtonProps {
  segments: readonly SkipSegment[];
  time: number;
  duration: number;
  image?: string;
  nextEpisode?: NextEpisodeInfo;
  onSkip: (seconds: number) => void;
  onNext?: () => void;
}

export function SkipButton({
  segments,
  time,
  duration,
  image,
  nextEpisode,
  onSkip,
  onNext,
}: SkipButtonProps) {
  const segment = activeSegment(segments, time);
  if (!segment) return null;

  if (nextEpisode && onNext && showsOutroCard(segment, true)) {
    const { seconds, fraction } = outroCountdown(segment, time, duration);
    return (
      <section
        aria-label={PLAYER_COPY.nextEpisode}
        data-testid="player:outro-card"
        className="pl-skip-in pointer-events-auto relative w-86 flex-none self-end overflow-hidden rounded-lg bg-surface text-ink shadow-card"
      >
        <div className="flex items-baseline justify-between gap-4 border-b border-border-strong px-6 py-4">
          <h2 className="text-body-strong font-semibold">
            {PLAYER_COPY.nextEpisode}
          </h2>
          <span className="text-badge text-muted tabular-nums">
            {PLAYER_COPY.playIn(seconds)}
          </span>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <NextThumb
            episode={nextEpisode.episode}
            image={image}
            fraction={fraction}
          />
          <div className="truncate text-body-strong font-semibold">
            {episodeTitle(nextEpisode.episode)}
          </div>
          <Button
            kind="pill"
            tone="play"
            icon={SkipForward}
            iconFilled
            data-testid="player:skip"
            data-kind="outro"
            className="w-full"
            onClick={onNext}
          >
            {PLAYER_COPY.playNow}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="pl-skip-in pointer-events-auto relative self-end">
      <Button
        kind="pill"
        tone="play"
        icon={SkipForward}
        data-testid="player:skip"
        data-kind={segment.kind}
        onClick={() => onSkip(segment.endS)}
      >
        {segment.kind === 'intro'
          ? PLAYER_COPY.skipIntro
          : PLAYER_COPY.skipOutro}
      </Button>
    </div>
  );
}
