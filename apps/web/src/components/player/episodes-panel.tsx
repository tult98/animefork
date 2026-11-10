import { PLAYER_COPY } from '../../lib/player/copy.ts';
import type { Episode, Season } from '../../lib/titles/watch.ts';
import { Check, ChevronLeft, Play } from '../ui/icons.ts';
import { IconButton } from './icon-button.tsx';

export type EpisodesView = 'episodes' | 'seasons';

export type BrowsedEpisodes =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'success'; episodes: Episode[] };

interface EpisodesPanelProps {
  view: EpisodesView;
  onView: (view: EpisodesView) => void;
  seasons: Season[];
  seasonEpisodeCounts: Record<string, number>;
  browseSlug: string;
  browsed: BrowsedEpisodes;
  playingSlug: string;
  playingEpisodeId: string;
  playingProgress: number;
  onPickSeason: (slug: string) => void;
  onPickEpisode: (slug: string, episode: Episode) => void;
}

const PANEL =
  'flex h-[min(560px,calc(100vh-200px))] flex-col overflow-hidden rounded-lg bg-surface text-ink shadow-card';

export function EpisodesPanel(props: EpisodesPanelProps) {
  return props.view === 'seasons' ? (
    <SeasonsView {...props} />
  ) : (
    <EpisodesView {...props} />
  );
}

function EpisodesView({
  onView,
  seasons,
  browseSlug,
  browsed,
  playingSlug,
  playingEpisodeId,
  playingProgress,
  onPickEpisode,
}: EpisodesPanelProps) {
  const season = seasons.find((s) => s.slug === browseSlug);
  return (
    <div className={PANEL} data-testid="player:episodes-panel">
      <div className="flex items-center gap-2 border-b border-border-strong py-3 pr-5 pl-3">
        <IconButton
          small
          label={PLAYER_COPY.backToSeasons}
          data-testid="player:seasons-back"
          onClick={() => onView('seasons')}
        >
          <ChevronLeft aria-hidden="true" />
        </IconButton>
        <h2 className="flex-1 text-title-sm">{season?.name}</h2>
        {browsed.status === 'success' ? (
          <span className="text-badge text-muted">
            {PLAYER_COPY.episodeCount(browsed.episodes.length)}
          </span>
        ) : null}
      </div>
      <div className="pl-scroll py-2">
        {browsed.status === 'pending' ? (
          <p className="px-5 py-3 text-muted" role="status">
            {PLAYER_COPY.loading}
          </p>
        ) : browsed.status === 'error' ? (
          <p className="px-5 py-3 text-muted" role="alert">
            {PLAYER_COPY.failed}
          </p>
        ) : (
          browsed.episodes.map((episode, index) => {
            const current =
              browseSlug === playingSlug && episode.id === playingEpisodeId;
            return (
              <button
                key={episode.id}
                type="button"
                className="pl-row gap-4 px-5 py-3"
                data-current={current}
                aria-current={current ? 'true' : undefined}
                data-testid={`episode:${index + 1}`}
                onClick={() => onPickEpisode(browseSlug, episode)}
              >
                <span className="w-6 flex-none text-center text-title-sm font-medium text-muted tabular-nums">
                  {index + 1}
                </span>
                <span className="relative flex h-[81px] w-36 flex-none items-center justify-center overflow-hidden rounded-md bg-surface-alt shadow-[inset_0_0_0_1px_var(--border-strong)]">
                  <span className="pl-glyph">
                    <Play aria-hidden="true" className="size-6 fill-current" />
                  </span>
                  {current ? (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-progress-track">
                      <span
                        className="block h-full bg-brand"
                        style={{ width: `${playingProgress}%` }}
                        data-testid="episode:progress"
                      />
                    </span>
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-body-strong">
                    {episode.name ?? episode.label}
                  </span>
                  {episode.name ? (
                    <span className="text-badge text-muted">
                      {episode.label}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function SeasonsView({
  seasons,
  seasonEpisodeCounts,
  browseSlug,
  onPickSeason,
}: EpisodesPanelProps) {
  return (
    <div className={PANEL} data-testid="player:seasons-panel">
      <div className="flex min-h-17 items-center border-b border-border-strong px-6 py-3">
        <h2 className="flex-1 text-title-sm">{PLAYER_COPY.seasons}</h2>
      </div>
      <div className="pl-scroll py-2">
        {seasons.map((season) => {
          const selected = season.slug === browseSlug;
          const count = seasonEpisodeCounts[season.slug];
          return (
            <button
              key={season.slug}
              type="button"
              className="pl-row min-h-16 justify-between gap-4 px-6 py-2"
              data-current={selected}
              aria-current={selected ? 'true' : undefined}
              data-testid={`season:${season.slug}`}
              onClick={() => onPickSeason(season.slug)}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-lg font-medium">{season.name}</span>
                {count !== undefined ? (
                  <span className="text-badge text-muted">
                    {PLAYER_COPY.episodeCount(count)}
                  </span>
                ) : null}
              </span>
              {selected ? (
                <Check aria-hidden="true" className="size-6" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
