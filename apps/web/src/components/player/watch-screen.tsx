import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { PLAYER_COPY } from '../../lib/player/copy.ts';
import { watchLink } from '../../lib/titles/link.ts';
import {
  EpisodeNotFoundError,
  fetchWatchPage,
  selectEpisode,
  type Episode,
  type WatchPage,
} from '../../lib/titles/watch.ts';
import { useTransport } from '../../lib/transport/index.ts';
import { ErrorScreen } from '../error-screen.tsx';
import { LoaderCircle } from '../ui/icons.ts';
import {
  EpisodesPanel,
  type BrowsedEpisodes,
  type EpisodesView,
} from './episodes-panel.tsx';
import { Player } from './player.tsx';

function useWatchPage(slug: string) {
  const transport = useTransport();
  return useQuery({
    queryKey: ['watch', slug],
    queryFn: ({ signal }) => fetchWatchPage(transport, slug, signal),
  });
}

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

  const page = useMemo(
    () => (watch.data ? select(watch.data, episodeId) : undefined),
    [watch.data, episodeId],
  );

  if (watch.error) {
    return (
      <div className="min-h-dvh bg-black pt-4">
        <ErrorScreen error={watch.error} onRetry={() => void watch.refetch()} />
      </div>
    );
  }
  if (page === null) {
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
      title={page.title}
      ageRating={page.ageRating}
      episode={page.currentEpisode}
      onNext={next ? () => open(slug, next) : undefined}
      onBack={goBack}
      episodesPanel={(progress) => (
        <EpisodesPanel
          view={view}
          title={page.title}
          image={page.image}
          description={page.description}
          onView={setView}
          seasons={page.seasons}
          browseSlug={browseSlug}
          browsed={browsed}
          playingSlug={slug}
          playingEpisodeId={page.currentEpisode.id}
          playingProgress={progress}
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
