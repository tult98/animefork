import {
  queryOptions,
  useQueries,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  EpisodeInfo,
  EpisodesResponse,
} from '../../../../api/src/art/contract.ts';
import { api } from '../api/client.ts';
import { artPollDelay } from './art.ts';
import { applyEpisodeInfo, episodeNumber } from './episode-info.ts';
import type { WatchPage } from './watch.ts';

const BUCKET = 100;

function bucketStart(number: number): number {
  return Math.floor((number - 1) / BUCKET) * BUCKET + 1;
}

function bucketsFor(page: WatchPage, shown: number): number[] {
  const index = page.episodes.findIndex((e) => e.id === page.currentEpisode.id);
  const nextEpisode = index === -1 ? undefined : page.episodes[index + 1];
  const wanted = [
    ...page.episodes.slice(0, shown),
    page.currentEpisode,
    ...(nextEpisode ? [nextEpisode] : []),
  ];
  const starts = new Set(
    wanted.flatMap((e) => {
      const number = episodeNumber(e.label);
      return number === undefined ? [] : [bucketStart(number)];
    }),
  );
  return [...starts].sort((a, b) => a - b);
}

// Module-level so the reference is stable and the combined array keeps its identity until a bucket result changes.
function readyEpisodes(
  results: UseQueryResult<EpisodesResponse>[],
): EpisodeInfo[] {
  return results.flatMap((r) =>
    r.data?.status === 'ready' ? r.data.episodes : [],
  );
}

export function useEpisodeInfo(
  slug: string,
  page: WatchPage | undefined,
  { shown = 0 }: { shown?: number } = {},
): WatchPage | undefined {
  const buckets = useMemo(
    () => (page ? bucketsFor(page, shown) : []),
    [page, shown],
  );
  const info = useQueries({
    queries: buckets.map((from) =>
      queryOptions({
        queryKey: ['watch-episode-info', slug, from],
        queryFn: ({ signal }) =>
          api
            .get(`v1/episodes/${slug}`, {
              searchParams: { from, limit: BUCKET },
              signal,
            })
            .json<EpisodesResponse>(),
        refetchInterval: (query) =>
          artPollDelay(
            query.state.data?.status === 'pending',
            query.state.dataUpdateCount,
          ),
      }),
    ),
    combine: readyEpisodes,
  });
  return useMemo(() => page && applyEpisodeInfo(page, info), [page, info]);
}
