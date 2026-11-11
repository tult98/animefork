import { skipToken, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTransport } from '../transport/index.ts';
import { applyArt, artPollDelay, fetchArt } from './art.ts';
import { watchLookupTitle } from './lookup.ts';
import { fetchWatchPage } from './watch.ts';

export function useWatchPage(slug: string) {
  const transport = useTransport();
  const watch = useQuery({
    queryKey: ['watch', slug],
    queryFn: ({ signal }) => fetchWatchPage(transport, slug, signal),
  });
  const title = useMemo(
    () => (watch.data ? watchLookupTitle(watch.data) : undefined),
    [watch.data],
  );
  const art = useQuery({
    queryKey: ['watch-art', title],
    queryFn:
      title && import.meta.env.VITE_API_URL
        ? ({ signal }) => fetchArt(title, { env: import.meta.env, signal })
        : skipToken,
    refetchInterval: (query) =>
      artPollDelay(query.state.data?.pending, query.state.dataUpdateCount),
  });
  // The first art answer is awaited so a stored backdrop never flashes in after the source image.
  const artSettling = art.isPending && art.fetchStatus === 'fetching';
  const data = useMemo(() => {
    if (!watch.data || artSettling) return undefined;
    return art.data ? applyArt(watch.data, art.data) : watch.data;
  }, [watch.data, art.data, artSettling]);
  return { data, error: watch.error, refetch: watch.refetch };
}
