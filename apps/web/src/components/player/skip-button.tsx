import { PLAYER_COPY } from '../../lib/player/copy.ts';
import {
  activeSegment,
  type SkipSegment,
} from '../../lib/player/skip-segments.ts';
import { Button } from '../ui/button.tsx';

interface SkipButtonProps {
  segments: readonly SkipSegment[];
  time: number;
  onSkip: (seconds: number) => void;
  onNext?: () => void;
}

function skipAction(
  segment: SkipSegment,
  onSkip: (seconds: number) => void,
  onNext?: () => void,
) {
  if (segment.kind === 'outro' && onNext) {
    return { label: PLAYER_COPY.nextEpisode, run: onNext };
  }
  return {
    label:
      segment.kind === 'intro' ? PLAYER_COPY.skipIntro : PLAYER_COPY.skipOutro,
    run: () => onSkip(segment.endS),
  };
}

export function SkipButton({
  segments,
  time,
  onSkip,
  onNext,
}: SkipButtonProps) {
  const segment = activeSegment(segments, time);
  if (!segment) return null;
  const { label, run } = skipAction(segment, onSkip, onNext);
  return (
    <Button
      kind="pill"
      tone="play"
      data-testid="player:skip"
      data-kind={segment.kind}
      className="pointer-events-auto relative self-end"
      onClick={run}
    >
      {label}
    </Button>
  );
}
