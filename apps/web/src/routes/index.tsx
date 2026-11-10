import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { ErrorScreen } from '../components/error-screen.tsx';
import { Hero, HeroSkeleton } from '../components/hero.tsx';
import { Shelf, ShelfSkeleton } from '../components/shelf.tsx';
import { publishShelves } from '../lib/app-hook.ts';
import {
  applyHomeArt,
  backdropSlugs,
  fetchBackdrops,
} from '../lib/titles/art.ts';
import { fetchHome, fetchSeason } from '../lib/titles/home.ts';
import { buildHome } from '../lib/titles/shelves.ts';
import { useTransport } from '../lib/transport/index.ts';

export const Route = createFileRoute('/')({ component: Home });

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

  const built = useMemo(
    () => (home.data ? buildHome({ ...home.data, season: season.data }) : []),
    [home.data, season.data],
  );
  const slugs = useMemo(() => backdropSlugs(built), [built]);
  const art = useQuery({
    queryKey: ['home-art', slugs],
    queryFn: ({ signal }) =>
      fetchBackdrops(slugs, { env: import.meta.env, signal }),
    enabled: slugs.length > 0 && Boolean(import.meta.env.VITE_ART_API_URL),
    placeholderData: keepPreviousData,
  });
  const shelves = useMemo(
    () => (art.data ? applyHomeArt(built, art.data) : built),
    [built, art.data],
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
      {seasonPath !== null && season.isPending ? (
        <ShelfSkeleton id="airing-this-season" />
      ) : null}
    </div>
  );
}
