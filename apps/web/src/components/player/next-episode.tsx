import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { episodeTitle } from '../../lib/player/format.ts';
import type { Episode } from '../../lib/titles/watch.ts';
import { SkipForward } from '../ui/icons.ts';
import { IconButton } from './icon-button.tsx';
import { NextThumb } from './next-thumb.tsx';

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
        <div className="pl-pop" style={{ width: 344 }}>
          <div
            className="overflow-hidden rounded-lg bg-surface text-ink shadow-card"
            data-testid="player:next-card"
          >
            <div className="border-b border-border-strong px-6 py-4 text-body-strong font-semibold">
              {PLAYER_COPY.nextEpisode}
            </div>
            <button
              type="button"
              className="pl-item flex-col items-stretch! gap-2 p-4"
              onClick={onNext}
              tabIndex={-1}
            >
              <NextThumb episode={next.episode} image={image} />
              <span className="truncate text-body-strong leading-[1.35] font-semibold">
                {episodeTitle(next.episode)}
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
