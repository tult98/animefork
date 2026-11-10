import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { formatClock, percent } from '../../lib/player/format.ts';

interface ScrubberProps {
  time: number;
  duration: number;
  onSeek: (seconds: number) => void;
}

export function Scrubber({ time, duration, onSeek }: ScrubberProps) {
  const pct = percent(time, duration);
  const max = Number.isFinite(duration) ? Math.floor(duration) : 0;
  return (
    <div className="pl-scrub min-w-0 flex-1">
      <div className="relative h-1 w-full rounded-full bg-progress-track">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${pct}%` }}
        />
        <div
          className="pl-knob absolute top-1/2 -mt-[7px] -ml-[7px] size-3.5 rounded-full bg-ink"
          style={{ left: `${pct}%` }}
        />
      </div>
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
