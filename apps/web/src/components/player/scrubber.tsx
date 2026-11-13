import { useState, type PointerEvent } from 'react';
import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { formatClock, percent } from '../../lib/player/format.ts';
import {
  scrubCaption,
  segmentTicks,
  type SkipSegment,
} from '../../lib/player/skip-segments.ts';

interface ScrubberProps {
  time: number;
  duration: number;
  segments: readonly SkipSegment[];
  onSeek: (seconds: number) => void;
}

export function Scrubber({ time, duration, segments, onSeek }: ScrubberProps) {
  const [hover, setHover] = useState<number>();
  const pct = percent(time, duration);
  const max = Number.isFinite(duration) ? Math.floor(duration) : 0;

  const track = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setHover(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
  };

  return (
    <div
      className="pl-scrub min-w-0 flex-1"
      onPointerMove={max > 0 ? track : undefined}
      onPointerLeave={() => setHover(undefined)}
    >
      <div className="pl-track relative w-full overflow-hidden rounded-full bg-pill-active">
        <div
          className="absolute inset-y-0 left-0 bg-brand"
          style={{ width: `${pct}%` }}
        />
        {segmentTicks(segments, duration).map((at) => (
          <div
            key={at}
            data-testid="player:tick"
            className="absolute inset-y-0 w-0.5 bg-canvas"
            style={{ left: `${at}%` }}
          />
        ))}
      </div>
      <div
        className="pl-knob absolute top-1/2 size-4 rounded-full bg-white shadow-[0_0_0_3px_var(--brand)]"
        style={{ left: `${pct}%` }}
      />
      {hover !== undefined ? (
        <div
          role="tooltip"
          data-testid="player:scrub-caption"
          className="pointer-events-none absolute bottom-8 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface px-2.5 py-1.5 text-badge tabular-nums shadow-card"
          style={{ left: `${Math.min(97, Math.max(3, hover * 100))}%` }}
        >
          {scrubCaption(segments, hover * duration)}
        </div>
      ) : null}
      <input
        className="pl-hit"
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(Math.floor(time), max)}
        disabled={max === 0}
        aria-label={PLAYER_COPY.seek}
        aria-valuetext={`${formatClock(time)} / ${formatClock(duration)}`}
        data-testid="player:seek"
        onChange={(event) => onSeek(Number(event.target.value))}
      />
    </div>
  );
}
