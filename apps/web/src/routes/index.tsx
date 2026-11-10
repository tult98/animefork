import { skipToken, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { ErrorScreen } from '../components/error-screen.tsx';
import { Hero } from '../components/hero.tsx';
import { Shelf, ShelfSkeleton } from '../components/shelf.tsx';
import { publishShelves } from '../lib/app-hook.ts';
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

  const shelves = useMemo(
    () => (home.data ? buildHome({ ...home.data, season: season.data }) : []),
    [home.data, season.data],
  );

  useEffect(() => {
    publishShelves(
      shelves.map((shelf) => ({
        id: shelf.id,
        paths: shelf.items.map((title) => title.path),
      })),
    );
    return () => publishShelves([]);
  }, [shelves]);

  if (home.error) {
    return (
      <ErrorScreen error={home.error} onRetry={() => void home.refetch()} />
    );
  }
  if (home.isPending) {
    return (
      <p className="py-16 text-muted" data-testid="home:loading">
        Loading
      </p>
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
