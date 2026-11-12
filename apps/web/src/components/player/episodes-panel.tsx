import { useState } from 'react';
import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { UNWATCHED, type EpisodeProgress } from '../../lib/progress/model.ts';
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
  progress: Map<string, EpisodeProgress>;
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

function ProgressLine({ fraction }: { fraction: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative h-0.5 w-28 flex-none bg-progress-track"
    >
      {fraction > 0 ? (
        <span
          className="absolute inset-y-0 left-0 bg-brand"
          style={{ width: `${fraction * 100}%` }}
          data-testid="episode:progress"
        />
      ) : null}
    </span>
  );
}

function EpisodeStatus({ n, state }: { n: number; state: EpisodeProgress }) {
  if (state.kind === 'watched') {
    // The check and the word carry the state, so it reads without the accent colour.
    return (
      <span
        className="flex w-28 flex-none items-center justify-end gap-1 text-sm text-muted"
        data-testid={`episode:${n}:watched`}
      >
        <Check aria-hidden="true" className="size-4" />
        {PLAYER_COPY.watched}
      </span>
    );
  }
  return (
    <>
      {state.kind === 'inProgress' ? (
        <span className="sr-only">{PLAYER_COPY.inProgress}</span>
      ) : null}
      <ProgressLine
        fraction={state.kind === 'inProgress' ? state.fraction : 0}
      />
    </>
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
  progress,
  onPickEpisode,
}: EpisodesPanelProps) {
  const season = seasons.find((s) => s.slug === browseSlug);
  const hasSeasons = seasons.length > 1;
  const [chosenId, setChosenId] = useState<string>();
  const expandedId =
    chosenId ?? (browseSlug === playingSlug ? playingEpisodeId : undefined);
  return (
    <div className={PANEL} data-testid="player:episodes-panel">
      <div
        className={`flex items-center gap-3 py-4 ${hasSeasons ? 'px-3' : 'px-6'}`}
      >
        {hasSeasons ? (
          <IconButton
            small
            label={PLAYER_COPY.backToSeasons}
            data-testid="player:seasons-back"
            onClick={() => onView('seasons')}
          >
            <ArrowLeft aria-hidden="true" />
          </IconButton>
        ) : null}
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
            const expanded = episode.id === expandedId;
            const n = index + 1;
            // The playing episode shows the live position once it moves, and what was saved until then.
            const state: EpisodeProgress =
              current && playingProgress > 0
                ? { kind: 'inProgress', fraction: playingProgress / 100 }
                : (progress.get(episode.id) ?? UNWATCHED);
            return (
              <div
                key={episode.id}
                className={`pl-er ${expanded ? 'bg-canvas outline-2 -outline-offset-2 outline-ink' : ''}`}
                data-current={current}
                data-expanded={expanded}
                data-progress={state.kind}
                data-testid={`episode:${n}`}
              >
                <button
                  type="button"
                  className="pl-row items-center! gap-5 px-6 py-4"
                  aria-expanded={expanded}
                  aria-current={current ? 'true' : undefined}
                  data-testid={`episode:${n}:toggle`}
                  onClick={() => setChosenId(episode.id)}
                >
                  <span className="w-6 flex-none text-center text-title-sm font-medium tabular-nums">
                    {n}
                  </span>
                  <span className="min-w-0 flex-1 text-title-sm font-medium">
                    {name}
                  </span>
                  <EpisodeStatus n={n} state={state} />
                </button>
                {expanded ? (
                  <div
                    className="flex gap-5 px-6 pb-5"
                    data-testid={current ? 'episode:now-playing' : undefined}
                  >
                    <button
                      type="button"
                      className="relative grid h-[94px] w-42 flex-none place-items-center overflow-hidden rounded-md bg-surface text-ink"
                      aria-label={`${PLAYER_COPY.play} ${name}`}
                      data-testid={`episode:${n}:play`}
                      onClick={() => {
                        setChosenId(undefined);
                        if (!current) onPickEpisode(browseSlug, episode);
                      }}
                    >
                      {episode.thumbnail || image ? (
                        <img
                          src={episode.thumbnail ?? image}
                          alt=""
                          className="absolute inset-0 size-full object-cover opacity-60"
                        />
                      ) : null}
                      {current ? (
                        <span className="relative flex items-center gap-2 text-body-strong">
                          <AudioLines aria-hidden="true" className="size-5" />
                          {PLAYER_COPY.nowPlaying}
                        </span>
                      ) : (
                        <span className="relative grid size-11 place-items-center rounded-full bg-hero-overlay shadow-[inset_0_0_0_2px_var(--ink)]">
                          <Play
                            aria-hidden="true"
                            className="ml-0.5 size-5 fill-current"
                          />
                        </span>
                      )}
                    </button>
                    {episode.synopsis ? (
                      <span className="line-clamp-4 text-sm">
                        {episode.synopsis}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
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
