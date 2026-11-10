import { skipToken, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { ErrorScreen } from '../components/error-screen.tsx';
import { publishShelves } from '../lib/app-hook.ts';
import { fetchHome, fetchSeason } from '../lib/titles/home.ts';
import { buildHome, type Shelf } from '../lib/titles/shelves.ts';
import type { Title } from '../lib/titles/title.ts';
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
    <div className="flex flex-col gap-10 py-8">
      {shelves.map((shelf) => (
        <ShelfSection key={shelf.id} shelf={shelf} />
      ))}
      {seasonPath !== null && season.isPending ? (
        <p
          className="text-muted"
          data-testid="shelf:airing-this-season:loading"
        >
          Loading
        </p>
      ) : null}
    </div>
  );
}

function ShelfSection({ shelf }: { shelf: Shelf }) {
  return (
    <section
      data-testid={`shelf:${shelf.id}`}
      aria-label={shelf.kind === 'hero' ? 'Nổi bật' : undefined}
    >
      {shelf.kind === 'hero' ? null : (
        <h2 className="mb-4 text-xl font-semibold">{shelf.title}</h2>
      )}
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        {shelf.items.map((title) => (
          <TitleCard
            key={title.path}
            title={title}
            rank={'rank' in title ? title.rank : undefined}
          />
        ))}
      </ul>
    </section>
  );
}

function TitleCard({
  title,
  rank,
}: {
  title: Title;
  rank: number | undefined;
}) {
  return (
    <li
      data-testid={`card:${title.path}`}
      className="overflow-hidden rounded-lg bg-surface shadow-card"
    >
      <img
        src={title.image}
        alt=""
        className="aspect-[2/3] w-full object-cover"
      />
      <div className="p-3">
        <p className="font-medium">
          {rank === undefined ? null : `${rank}. `}
          {title.name}
        </p>
        <p className="text-sm text-muted">
          {title.episodeLabel} · {title.rating.toFixed(1)}
        </p>
      </div>
    </li>
  );
}
