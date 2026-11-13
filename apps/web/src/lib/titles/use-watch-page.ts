import { skipToken, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { EpisodesResponse } from '../../../../api/src/art/contract.ts';
import { api } from '../api/client.ts';
import { upstream } from '../transport/index.ts';
import { applyArt, artPollDelay, fetchArt } from './art.ts';
import { applyEpisodeInfo } from './episode-info.ts';
import { watchLookupTitle } from './lookup.ts';
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
    queryFn:
      title && import.meta.env.VITE_API_URL
        ? ({ signal }) => fetchArt(title, { env: import.meta.env, signal })
        : skipToken,
    refetchInterval: (query) =>
      artPollDelay(query.state.data?.pending, query.state.dataUpdateCount),
  });
  const info = useQuery({
    queryKey: ['watch-episode-info', slug],
    queryFn: import.meta.env.VITE_API_URL
      ? ({ signal }) =>
          api.get(`v1/episodes/${slug}`, { signal }).json<EpisodesResponse>()
      : skipToken,
    refetchInterval: (query) =>
      artPollDelay(
        query.state.data?.status === 'pending',
        query.state.dataUpdateCount,
      ),
  });
  // The first art answer is awaited so a stored backdrop never flashes in after the source image.
  const artSettling = art.isPending && art.fetchStatus === 'fetching';
  const data = useMemo(() => {
    if (!watch.data || artSettling) return undefined;
    const arted = art.data ? applyArt(watch.data, art.data) : watch.data;
    return info.data ? applyEpisodeInfo(arted, info.data) : arted;
  }, [watch.data, art.data, info.data, artSettling]);
  return { data, error: watch.error, refetch: watch.refetch };
}
