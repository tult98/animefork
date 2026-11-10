import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { Volume2, VolumeX } from '../ui/icons.ts';
import { IconButton } from './icon-button.tsx';

interface VolumeControlProps {
  volume: number;
  muted: boolean;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
}

export function VolumeControl({
  volume,
  muted,
  onVolume,
  onToggleMute,
}: VolumeControlProps) {
  const silent = muted || volume === 0;
  const pct = silent ? 0 : Math.round(volume * 100);
  return (
    <div className="pl-vw">
      <IconButton
        label={silent ? PLAYER_COPY.unmute : PLAYER_COPY.mute}
        data-testid="player:mute"
        onClick={onToggleMute}
      >
        {silent ? (
          <VolumeX aria-hidden="true" />
        ) : (
          <Volume2 aria-hidden="true" />
        )}
      </IconButton>
      <div className="pl-vs">
        <div className="flex w-11 flex-col items-center overflow-hidden rounded-lg bg-surface py-4 shadow-card">
          <div className="pl-vtrack">
            <div className="relative h-full w-1 rounded-full bg-progress-track">
              <div
                className="absolute bottom-0 left-0 w-full rounded-full bg-ink"
                style={{ height: `${pct}%` }}
              />
              <div
                className="absolute left-1/2 -mb-[7px] -ml-[7px] size-3.5 rounded-full bg-ink"
                style={{ bottom: `${pct}%` }}
              />
            </div>
            <input
              className="pl-hit"
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              aria-label={PLAYER_COPY.volume}
              aria-orientation="vertical"
              data-testid="player:volume"
              onChange={(event) => onVolume(Number(event.target.value) / 100)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
