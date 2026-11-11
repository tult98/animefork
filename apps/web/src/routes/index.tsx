import {
  keepPreviousData,
  skipToken,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { ErrorScreen } from '../components/error-screen.tsx';
import { Hero, HeroSkeleton } from '../components/hero.tsx';
import { Shelf, ShelfSkeleton } from '../components/shelf.tsx';
import { publishShelves } from '../lib/app-hook.ts';
import {
  applyHomeArt,
  applyRatings,
  artPollDelay,
  artSkeletonLeft,
  fetchHomeArt,
  markArtPending,
} from '../lib/titles/art.ts';
import { useAvsSubmit } from '../lib/titles/use-avs-submit.ts';
import { fetchHome, fetchSeason } from '../lib/titles/home.ts';
import { lookupTitles } from '../lib/titles/lookup.ts';
import { buildHome } from '../lib/titles/shelves.ts';
import { useTransport } from '../lib/transport/index.ts';

export const Route = createFileRoute('/')({ component: Home });

const NO_SLUGS: readonly string[] = [];

function Home() {
  const transport = useTransport();
  const home = useQuery({
    queryKey: ['home'],
    queryFn: ({ signal }) => fetchHome(transport, signal),
  });
  const seasonPath = home.data?.seasonPath ?? null;
  const season = useQuery({
    queryKey: ['season', seasonPath],
    queryFn: seasonPath
      ? ({ signal }) => fetchSeason(transport, seasonPath, signal)
      : skipToken,
  });

  const seasonLoading = seasonPath !== null && season.isPending;
  const built = useMemo(() => {
    if (!home.data) return [];
    // Hold the upcoming shelf back so the season shelf does not land above it later.
    const upcoming = seasonLoading ? [] : home.data.upcoming;
    return buildHome({ ...home.data, upcoming, season: season.data });
  }, [home.data, season.data, seasonLoading]);
  const titles = useMemo(() => lookupTitles(built), [built]);
  const queryClient = useQueryClient();
  const artKey = ['home-art', titles];
  const art = useQuery({
    queryKey: artKey,
    queryFn: ({ signal }) =>
      fetchHomeArt(titles, { env: import.meta.env, signal }),
    enabled: titles.length > 0 && Boolean(import.meta.env.VITE_API_URL),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      artPollDelay(query.state.data?.pending, query.state.dataUpdateCount),
  });
  const apiOn = Boolean(import.meta.env.VITE_API_URL);
  const pollsLeft =
    art.isPlaceholderData ||
    artSkeletonLeft(queryClient.getQueryState(artKey)?.dataUpdateCount ?? 0);
  const shelves = useMemo(() => {
    const applied = art.data
      ? applyRatings(applyHomeArt(built, art.data.paths), art.data.ratings)
      : built;
    return markArtPending(applied, {
      apiOn,
      art: art.data,
      pollsLeft,
      failed: art.isError,
      sent: new Set(titles.map((t) => t.slug)),
    });
  }, [built, titles, art.data, art.isError, apiOn, pollsLeft]);
  useAvsSubmit(
    shelves,
    art.data?.avsStale ?? NO_SLUGS,
    import.meta.env.VITE_API_URL,
  );

  useEffect(() => {
    publishShelves(shelves);
    return () => publishShelves([]);
  }, [shelves]);

  if (home.error) {
    return (
      <ErrorScreen error={home.error} onRetry={() => void home.refetch()} />
    );
  }
  if (home.isPending) {
    return (
      <div className="pt-4" data-testid="home:loading">
        <HeroSkeleton />
        <ShelfSkeleton id="new-episodes" />
        <ShelfSkeleton id="top-10-today" />
      </div>
    );
  }

  return (
    <div className="pt-4">
      {shelves.map((shelf) =>
        shelf.kind === 'hero' ? (
          <Hero key={shelf.id} items={shelf.items} />
        ) : (
          <Shelf key={shelf.id} shelf={shelf} />
        ),
      )}
      {seasonLoading ? <ShelfSkeleton id="airing-this-season" /> : null}
    </div>
  );
}
