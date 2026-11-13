import { useLayoutEffect, useRef, type RefCallback } from 'react';
import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { episodeRowText } from '../../lib/player/episode-row.ts';
import { episodeTitle } from '../../lib/player/format.ts';
import { UNWATCHED, type EpisodeProgress } from '../../lib/progress/model.ts';
import type { Episode, Season } from '../../lib/titles/watch.ts';
import { Check, ChevronDown, ChevronLeft, Play, X } from '../ui/icons.ts';
import { IconButton } from './icon-button.tsx';

export type EpisodesView = 'episodes' | 'seasons';

export type BrowsedEpisodes =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'success'; episodes: Episode[] };

interface EpisodesPanelProps {
  view: EpisodesView;
  onView: (view: EpisodesView) => void;
  onClose: () => void;
  title: string;
  image?: string;
  seasons: Season[];
  browseSlug: string;
  browsed: BrowsedEpisodes;
  start: number;
  end: number;
  topRef: RefCallback<HTMLDivElement>;
  bottomRef: RefCallback<HTMLDivElement>;
  playingSlug: string;
  playingEpisodeId: string;
  playingProgress: number;
  progress: Map<string, EpisodeProgress>;
  onPickSeason: (slug: string) => void;
  onPickEpisode: (slug: string, episode: Episode) => void;
}

const PANEL =
  'flex h-[min(560px,calc(100vh-200px))] flex-col overflow-hidden rounded-lg bg-surface text-ink shadow-card';
const HEADER =
  'flex min-h-15 items-center border-b border-border-strong py-2 pr-2 pl-4';

export function EpisodesPanel(props: EpisodesPanelProps) {
  return props.view === 'seasons' ? (
    <SeasonsView {...props} />
  ) : (
    <EpisodesView {...props} />
  );
}

function ThumbOverlay({ current }: { current: boolean }) {
  return current ? (
    <span
      data-testid="episode:now-playing"
      className="absolute inset-0 grid place-items-center bg-hero-overlay"
    >
      <svg
        aria-hidden="true"
        className="pl-eq size-[22px] fill-white"
        viewBox="0 0 22 22"
      >
        <rect x="3" y="2" width="4" height="18" rx="2" />
        <rect x="9" y="2" width="4" height="18" rx="2" />
        <rect x="15" y="2" width="4" height="18" rx="2" />
      </svg>
    </span>
  ) : (
    <span className="pl-thumb-play absolute inset-0 grid place-items-center bg-hero-overlay">
      <Play aria-hidden="true" className="size-6 fill-current" />
    </span>
  );
}

function EpisodeRow({
  episode,
  image,
  n,
  current,
  state,
  onPick,
}: {
  episode: Episode;
  image?: string;
  n: number;
  current: boolean;
  state: EpisodeProgress;
  onPick: () => void;
}) {
  const text = episodeRowText(
    episode,
    current ? 'current' : state.kind === 'watched' ? 'watched' : undefined,
  );
  const src = episode.thumbnail ?? image;
  const fraction = state.kind === 'inProgress' ? state.fraction : 0;
  const statusClass = `text-badge ${current ? 'text-ink' : 'text-muted'}`;
  const watched = state.kind === 'watched' && !current;
  return (
    <button
      type="button"
      className="pl-item gap-4 rounded-lg p-2 data-[current=true]:shadow-[inset_0_0_0_1px_var(--border)]"
      aria-current={current ? 'true' : undefined}
      aria-label={`${PLAYER_COPY.play} ${episodeTitle(episode)}`}
      data-current={current}
      data-progress={state.kind}
      data-testid={`episode:${n}`}
      onClick={onPick}
    >
      <span className="relative h-18 w-32 flex-none overflow-hidden rounded-md bg-surface-alt">
        {src ? (
          <img
            src={src}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        <ThumbOverlay current={current} />
        {current || fraction > 0 ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1 bg-progress-track"
          >
            <span
              className="block h-full bg-brand"
              style={{ width: `${fraction * 100}%` }}
              data-testid={fraction > 0 ? 'episode:progress' : undefined}
            />
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {text.meta ? (
          <span
            className={statusClass}
            data-testid={watched ? `episode:${n}:watched` : undefined}
          >
            {text.meta}
          </span>
        ) : null}
        <span className="line-clamp-2 text-body-strong leading-[1.35] font-semibold">
          {text.title}
        </span>
        {episode.synopsis ? (
          <span
            className="line-clamp-3 text-badge text-muted"
            data-testid={`episode:${n}:synopsis`}
          >
            {episode.synopsis}
          </span>
        ) : null}
        {text.below ? (
          <span
            className={statusClass}
            data-testid={watched ? `episode:${n}:watched` : undefined}
          >
            {text.below}
          </span>
        ) : null}
        {state.kind === 'inProgress' && !current ? (
          <span className="sr-only">{PLAYER_COPY.inProgress}</span>
        ) : null}
      </span>
    </button>
  );
}

function EpisodesView({
  onView,
  onClose,
  image,
  seasons,
  browseSlug,
  browsed,
  start,
  end,
  topRef,
  bottomRef,
  playingSlug,
  playingEpisodeId,
  playingProgress,
  progress,
  onPickEpisode,
}: EpisodesPanelProps) {
  const season = seasons.find((s) => s.slug === browseSlug);
  const hasSeasons = seasons.length > 1;
  const scrollRef = useRef<HTMLDivElement>(null);
  const loaded = browsed.status === 'success';

  // Set on the container rather than with scrollIntoView, which would also scroll the page behind the panel.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const row = scroller?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!scroller || !row) return;
    const top =
      row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += top - (scroller.clientHeight - row.offsetHeight) / 2;
  }, [loaded, browseSlug, playingEpisodeId]);

  return (
    <div className={PANEL} data-testid="player:episodes-panel">
      <div className={`${HEADER} justify-between`}>
        {hasSeasons ? (
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-pill-quiet pr-4 pl-6 text-body-strong hover:bg-pill-active"
            aria-haspopup="true"
            aria-label={PLAYER_COPY.seasonPicker(season?.name ?? '')}
            data-testid="player:seasons"
            onClick={() => onView('seasons')}
          >
            {season?.name}
            <ChevronDown aria-hidden="true" className="size-5" />
          </button>
        ) : (
          <h2 className="ml-2 text-title-sm">{PLAYER_COPY.episodes}</h2>
        )}
        <IconButton
          small
          label={PLAYER_COPY.closeEpisodes}
          data-testid="player:episodes-close"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </IconButton>
      </div>
      <div ref={scrollRef} className="pl-scroll flex flex-col gap-1 p-2">
        {loaded && start > 0 ? <div ref={topRef} aria-hidden="true" /> : null}
        {browsed.status === 'pending' ? (
          <p className="px-3 py-3 text-muted" role="status">
            {PLAYER_COPY.loading}
          </p>
        ) : browsed.status === 'error' ? (
          <p className="px-3 py-3 text-muted" role="alert">
            {PLAYER_COPY.failed}
          </p>
        ) : (
          browsed.episodes.slice(start, end).map((episode, index) => {
            const current =
              browseSlug === playingSlug && episode.id === playingEpisodeId;
            // The playing episode shows the live position once it moves, and what was saved until then.
            const state: EpisodeProgress =
              current && playingProgress > 0
                ? { kind: 'inProgress', fraction: playingProgress / 100 }
                : (progress.get(episode.id) ?? UNWATCHED);
            return (
              <EpisodeRow
                key={episode.id}
                episode={episode}
                image={image}
                n={start + index + 1}
                current={current}
                state={state}
                onPick={() => {
                  if (!current) onPickEpisode(browseSlug, episode);
                }}
              />
            );
          })
        )}
        {loaded && end < browsed.episodes.length ? (
          <div ref={bottomRef} aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}

function SeasonsView({
  title,
  seasons,
  browseSlug,
  onView,
  onPickSeason,
}: EpisodesPanelProps) {
  return (
    <div className={PANEL} data-testid="player:seasons-panel">
      <div className={`${HEADER} gap-2 pr-4 pl-2`}>
        <IconButton
          small
          label={PLAYER_COPY.backToEpisodes}
          data-testid="player:seasons-back"
          onClick={() => onView('episodes')}
        >
          <ChevronLeft aria-hidden="true" />
        </IconButton>
        <h2 className="min-w-0 truncate text-title-sm">{title}</h2>
      </div>
      <div role="list" className="pl-scroll flex flex-col gap-1 p-2">
        <div className="px-4 pt-2 pb-1 text-badge text-muted">
          {PLAYER_COPY.pickSeason}
        </div>
        {seasons.map((season) => {
          const selected = season.slug === browseSlug;
          return (
            <button
              key={season.slug}
              type="button"
              role="listitem"
              className="pl-item min-h-16 justify-between gap-4 rounded-lg p-4"
              data-current={selected}
              aria-current={selected ? 'true' : undefined}
              data-testid={`season:${season.slug}`}
              onClick={() => onPickSeason(season.slug)}
            >
              <span className="text-body-strong leading-[1.35] font-semibold">
                {season.name}
              </span>
              {selected ? (
                <Check aria-hidden="true" className="size-6 flex-none" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
