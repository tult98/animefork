import { skipToken, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { upstream } from '../transport/index.ts';
import { applyArt, artPollDelay, fetchArt, fetchHomeArt } from './art.ts';
import { seasonLookupTitles, watchLookupTitle } from './lookup.ts';
import { sortSeasons } from './season-order.ts';
import { parseWatchPage } from './watch.ts';

export function useWatchPage(slug: string) {
  const watch = useQuery({
    queryKey: ['watch', slug],
    queryFn: ({ signal }) =>
      upstream
        .get(`phim/${slug}/xem-phim.html`, { signal })
        .text()
        .then((html) => parseWatchPage(html, slug)),
  });
  const title = useMemo(
    () => (watch.data ? watchLookupTitle(watch.data) : undefined),
    [watch.data],
  );
  const art = useQuery({
    queryKey: ['watch-art', title],
    queryFn: title
      ? ({ signal }) => fetchArt(title, { env: import.meta.env, signal })
      : skipToken,
    refetchInterval: (query) =>
      artPollDelay(query.state.data?.pending, query.state.dataUpdateCount),
  });
  const seasonCount = watch.data?.seasons.length ?? 0;
  const seasonOrder = useQuery({
    queryKey: ['watch-season-order', slug],
    queryFn:
      watch.data && seasonCount > 1
        ? ({ signal }) =>
            fetchHomeArt(seasonLookupTitles(watch.data), {
              env: import.meta.env,
              signal,
            })
        : skipToken,
    refetchInterval: (query) =>
      artPollDelay(query.state.data?.pending, query.state.dataUpdateCount),
  });
  // The first art answer is awaited so a stored backdrop never flashes in after the source image.
  const artSettling = art.isPending && art.fetchStatus === 'fetching';
  const data = useMemo(() => {
    if (!watch.data || artSettling) return undefined;
    const arted = art.data ? applyArt(watch.data, art.data) : watch.data;
    const startDates = new Map(
      [...(seasonOrder.data?.ratings ?? [])].map(([key, r]) => [
        key,
        r.mal?.startDate,
      ]),
    );
    return { ...arted, seasons: sortSeasons(arted.seasons, startDates) };
  }, [watch.data, art.data, seasonOrder.data, artSettling]);
  return { data, error: watch.error, refetch: watch.refetch };
}
