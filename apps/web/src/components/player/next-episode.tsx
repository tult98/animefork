import { PLAYER_COPY } from '../../lib/player/copy.ts';
import type { Episode } from '../../lib/titles/watch.ts';
import { Play, SkipForward } from '../ui/icons.ts';
import { IconButton } from './icon-button.tsx';

export interface NextEpisodeInfo {
  episode: Episode;
  number: number;
}

interface NextEpisodeProps {
  next?: NextEpisodeInfo;
  image?: string;
  onNext?: () => void;
}

export function NextEpisode({ next, image, onNext }: NextEpisodeProps) {
  return (
    <div className="pl-pw">
      <IconButton
        label={PLAYER_COPY.nextEpisode}
        data-testid="player:next"
        disabled={!onNext}
        onClick={onNext}
      >
        <SkipForward aria-hidden="true" />
      </IconButton>
      {next ? (
        <div className="pl-pop" style={{ width: 520 }}>
          <div
            className="overflow-hidden rounded-lg bg-surface text-ink shadow-card"
            data-testid="player:next-card"
          >
            <div className="bg-surface-alt px-6 py-4 text-title-sm">
              {PLAYER_COPY.nextEpisode}
            </div>
            <button
              type="button"
              className="pl-row items-start! gap-6 p-6"
              onClick={onNext}
              tabIndex={-1}
            >
              <span className="relative grid h-28 w-50 flex-none place-items-center overflow-hidden rounded-md bg-surface-alt">
                {next.episode.thumbnail || image ? (
                  <img
                    src={next.episode.thumbnail ?? image}
                    alt=""
                    className="absolute inset-0 size-full object-cover opacity-60"
                  />
                ) : null}
                <span className="relative grid size-11 place-items-center rounded-full bg-hero-overlay shadow-[inset_0_0_0_2px_var(--ink)]">
                  <Play
                    aria-hidden="true"
                    className="ml-0.5 size-5 fill-current"
                  />
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="flex items-baseline gap-4 text-lg font-semibold">
                  <span className="tabular-nums">{next.number}</span>
                  <span>{next.episode.name ?? next.episode.label}</span>
                </span>
                {next.episode.synopsis ? (
                  <span className="text-sm">{next.episode.synopsis}</span>
                ) : null}
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
