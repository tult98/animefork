import { PLAYER_COPY } from '../../lib/player/copy.ts';
import type { Episode, Season } from '../../lib/titles/watch.ts';
import { ArrowLeft, AudioLines, Check, Play } from '../ui/icons.ts';
import { IconButton } from './icon-button.tsx';

export type EpisodesView = 'episodes' | 'seasons';

export type BrowsedEpisodes =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'success'; episodes: Episode[] };

interface EpisodesPanelProps {
  view: EpisodesView;
  onView: (view: EpisodesView) => void;
  title: string;
  image?: string;
  seasons: Season[];
  browseSlug: string;
  browsed: BrowsedEpisodes;
  playingSlug: string;
  playingEpisodeId: string;
  playingProgress: number;
  onPickSeason: (slug: string) => void;
  onPickEpisode: (slug: string, episode: Episode) => void;
}

const PANEL =
  'flex h-[min(560px,calc(100vh-200px))] flex-col overflow-hidden rounded-lg bg-surface-alt text-ink shadow-card';

export function EpisodesPanel(props: EpisodesPanelProps) {
  return props.view === 'seasons' ? (
    <SeasonsView {...props} />
  ) : (
    <EpisodesView {...props} />
  );
}

function ProgressLine({ percent }: { percent: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative h-0.5 w-28 flex-none bg-progress-track"
    >
      {percent > 0 ? (
        <span
          className="absolute inset-y-0 left-0 bg-brand"
          style={{ width: `${percent}%` }}
          data-testid="episode:progress"
        />
      ) : null}
    </span>
  );
}

function EpisodesView({
  onView,
  image,
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
      <div className="flex items-center gap-3 px-3 py-4">
        <IconButton
          small
          label={PLAYER_COPY.backToSeasons}
          data-testid="player:seasons-back"
          onClick={() => onView('seasons')}
        >
          <ArrowLeft aria-hidden="true" />
        </IconButton>
        <h2 className="flex-1 text-title-sm">{season?.name}</h2>
      </div>
      <div className="pl-scroll">
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
            const name = episode.name ?? episode.label;
            return (
              <button
                key={episode.id}
                type="button"
                className="pl-row group flex-col items-stretch gap-4 px-6 py-4"
                data-current={current}
                aria-current={current ? 'true' : undefined}
                data-testid={`episode:${index + 1}`}
                onClick={() => onPickEpisode(browseSlug, episode)}
              >
                <span className="flex items-center gap-5">
                  <span className="w-6 flex-none text-center text-title-sm font-medium tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-title-sm font-medium">
                    {name}
                  </span>
                  <ProgressLine percent={current ? playingProgress : 0} />
                </span>
                <span
                  className="hidden gap-5 group-hover:flex group-focus-visible:flex group-data-[current=true]:flex"
                  data-testid={current ? 'episode:now-playing' : undefined}
                >
                  <span className="relative grid h-[94px] w-42 flex-none place-items-center overflow-hidden rounded-md bg-surface">
                    {episode.thumbnail || image ? (
                      <img
                        src={episode.thumbnail ?? image}
                        alt=""
                        className="absolute inset-0 size-full object-cover opacity-60"
                      />
                    ) : null}
                    <span className="relative flex items-center gap-2 text-body-strong">
                      {current ? (
                        <>
                          <AudioLines aria-hidden="true" className="size-5" />
                          {PLAYER_COPY.nowPlaying}
                        </>
                      ) : (
                        <>
                          <Play
                            aria-hidden="true"
                            className="size-5 fill-current"
                          />
                          {PLAYER_COPY.play}
                        </>
                      )}
                    </span>
                  </span>
                  {episode.synopsis ? (
                    <span className="line-clamp-4 text-sm">
                      {episode.synopsis}
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
  title,
  seasons,
  browseSlug,
  onPickSeason,
}: EpisodesPanelProps) {
  return (
    <div className={PANEL} data-testid="player:seasons-panel">
      <div className="px-6 py-5">
        <h2 className="text-title-sm">{title}</h2>
      </div>
      <div className="pl-scroll">
        {seasons.map((season) => {
          const selected = season.slug === browseSlug;
          return (
            <button
              key={season.slug}
              type="button"
              className="pl-row min-h-14 gap-4 px-4 py-2"
              data-current={selected}
              aria-current={selected ? 'true' : undefined}
              data-testid={`season:${season.slug}`}
              onClick={() => onPickSeason(season.slug)}
            >
              <span className="grid size-6 flex-none place-items-center">
                {selected ? (
                  <Check aria-hidden="true" className="size-6" />
                ) : null}
              </span>
              <span className="text-lg font-medium">{season.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
