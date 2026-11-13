import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { WatchProgressEpisode } from '../../../../api/src/watch-progress/contract.ts';
import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { progressByEpisode } from '../../lib/progress/model.ts';
import { resumePoint, startPosition } from '../../lib/progress/resume.ts';
import { useProgressRows } from '../../lib/progress/use-progress.ts';
import { watchLink } from '../../lib/titles/link.ts';
import {
  EpisodeNotFoundError,
  selectEpisode,
  type Episode,
  type WatchPage,
} from '../../lib/titles/watch.ts';
import { useWatchPage } from '../../lib/titles/use-watch-page.ts';
import { ErrorScreen } from '../error-screen.tsx';
import { LoaderCircle } from '../ui/icons.ts';
import {
  EpisodesPanel,
  type BrowsedEpisodes,
  type EpisodesView,
} from './episodes-panel.tsx';
import { Player } from './player.tsx';

function select(page: WatchPage, episodeId?: string) {
  try {
    return episodeId ? selectEpisode(page, episodeId) : page;
  } catch (error) {
    if (error instanceof EpisodeNotFoundError) return null;
    throw error;
  }
}

export function WatchScreen({
  slug,
  episodeId,
}: {
  slug: string;
  episodeId?: string;
}) {
  const navigate = useNavigate();
  const watch = useWatchPage(slug);
  const [browse, setBrowse] = useState<string | null>(null);
  const [view, setView] = useState<EpisodesView>('episodes');
  const browseSlug = browse ?? slug;
  const browsedQuery = useWatchPage(browseSlug);

  const slugRows = useProgressRows(slug);
  const browsedRows = useProgressRows(browseSlug);
  const browsedRowList =
    browsedRows.status === 'ready' ? browsedRows.rows : undefined;
  const browsedStates = useMemo(
    () => progressByEpisode(browsedRowList ?? []),
    [browsedRowList],
  );
  const latestRows = slugRows.status === 'ready' ? slugRows.rows : [];
  // Where to resume is decided once per title, from the rows as they were on arrival. The saves made while
  // watching update the cached rows, and a later answer must not move the viewer to another episode mid-playback.
  const [snapshot, setSnapshot] = useState<{
    slug: string;
    rows: WatchProgressEpisode[];
  }>();
  if (slugRows.status !== 'pending' && snapshot?.slug !== slug) {
    setSnapshot({ slug, rows: latestRows });
  }
  const basis = snapshot?.slug === slug ? snapshot.rows : undefined;

  const resolved = useMemo(() => {
    if (!watch.data || !basis) return undefined;
    if (episodeId) {
      const picked = select(watch.data, episodeId);
      return (
        picked && { page: picked, startS: startPosition(episodeId, basis) }
      );
    }
    const point = resumePoint(watch.data.episodes, basis);
    return {
      page: point ? selectEpisode(watch.data, point.episodeId) : watch.data,
      startS: point?.positionS ?? 0,
    };
  }, [watch.data, episodeId, basis]);
  const page = resolved?.page;

  if (watch.error) {
    return (
      <div className="min-h-dvh bg-black pt-4">
        <ErrorScreen error={watch.error} onRetry={() => void watch.refetch()} />
      </div>
    );
  }
  if (resolved === null) {
    return (
      <div
        role="alert"
        data-testid="watch:not-found"
        className="grid min-h-dvh place-items-center bg-black text-center"
      >
        <div className="flex flex-col items-center gap-4">
          <p className="text-title-sm">{PLAYER_COPY.failed}</p>
          <Link {...watchLink(slug)} className="af-pill af-pill--brand">
            {PLAYER_COPY.play}
          </Link>
        </div>
      </div>
    );
  }
  if (!page) {
    return (
      <div
        role="status"
        aria-label={PLAYER_COPY.loading}
        data-testid="watch:loading"
        className="grid h-dvh place-items-center bg-black text-ink"
      >
        <LoaderCircle aria-hidden="true" className="size-12 animate-spin" />
      </div>
    );
  }

  const episodes = page.episodes;
  const index = episodes.findIndex((e) => e.id === page.currentEpisode.id);
  const next = episodes[index + 1];
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else void navigate({ to: '/' });
  };
  const open = (targetSlug: string, episode: Episode) => {
    // A pick is a fresh decision, and what was just watched may have moved since the first answer.
    if (targetSlug === slug) setSnapshot({ slug, rows: latestRows });
    setBrowse(null);
    setView('episodes');
    void navigate({ ...watchLink(targetSlug, episode.id), replace: true });
  };

  const browsed: BrowsedEpisodes = browsedQuery.data
    ? { status: 'success', episodes: browsedQuery.data.episodes }
    : browsedQuery.error
      ? { status: 'error' }
      : { status: 'pending' };

  return (
    <Player
      slug={slug}
      seasonSlug={page.currentSeason.slug}
      seriesKey={page.seasons[0]?.slug}
      title={page.title}
      seasonName={page.seasons.length > 1 ? page.currentSeason.name : undefined}
      episode={page.currentEpisode}
      image={page.image}
      startS={resolved?.startS ?? 0}
      nextEpisode={next ? { episode: next, number: index + 2 } : undefined}
      onNext={next ? () => open(slug, next) : undefined}
      onBack={goBack}
      episodesPanel={(progress, close) => (
        <EpisodesPanel
          view={view}
          title={page.title}
          image={page.image}
          onView={setView}
          onClose={close}
          seasons={page.seasons}
          browseSlug={browseSlug}
          browsed={browsed}
          playingSlug={slug}
          playingEpisodeId={page.currentEpisode.id}
          playingProgress={progress}
          progress={browsedStates}
          onPickSeason={(picked) => {
            setBrowse(picked);
            setView('episodes');
          }}
          onPickEpisode={open}
        />
      )}
    />
  );
}
