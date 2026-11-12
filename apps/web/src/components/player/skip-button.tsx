import { PLAYER_COPY } from '../../lib/player/copy.ts';
import {
  activeSegment,
  type SkipSegment,
} from '../../lib/player/skip-segments.ts';
import { Button } from '../ui/button.tsx';

const LABEL = {
  intro: PLAYER_COPY.skipIntro,
  outro: PLAYER_COPY.skipOutro,
} as const;

interface SkipButtonProps {
  segments: readonly SkipSegment[];
  time: number;
  onSkip: (seconds: number) => void;
}

export function SkipButton({ segments, time, onSkip }: SkipButtonProps) {
  const segment = activeSegment(segments, time);
  if (!segment) return null;
  return (
    <Button
      kind="pill"
      tone="play"
      data-testid="player:skip"
      data-kind={segment.kind}
      className="pointer-events-auto relative self-end"
      onClick={() => onSkip(segment.endS)}
    >
      {LABEL[segment.kind]}
    </Button>
  );
}
