import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { Check } from '../ui/icons.ts';

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function speedLabel(speed: number): string {
  return speed === 1 ? PLAYER_COPY.normalSpeed : `${speed}×`;
}

export function SpeedPanel({
  rate,
  onPick,
}: {
  rate: number;
  onPick: (speed: number) => void;
}) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg bg-surface text-ink shadow-card"
      data-testid="player:speed-panel"
    >
      <h2 className="px-6 pt-4 pb-2 text-title-sm">{PLAYER_COPY.speedTitle}</h2>
      <div className="pb-2">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className="pl-item min-h-11 justify-between gap-4 px-6 text-body-strong"
            data-current={rate === speed}
            aria-pressed={rate === speed}
            data-testid={`speed:${speed}`}
            onClick={() => onPick(speed)}
          >
            <span>{speedLabel(speed)}</span>
            {rate === speed ? (
              <Check aria-hidden="true" className="size-5" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
