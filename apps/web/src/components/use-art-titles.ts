import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  applyHomeArt,
  applyRatings,
  artPollDelay,
  artSkeletonLeft,
  fetchHomeArt,
  markArtPending,
} from '../lib/titles/art.ts';
import { lookupTitles } from '../lib/titles/lookup.ts';
import type { DefaultShelf } from '../lib/titles/shelves.ts';

/** The shelf's titles with art and ratings from the API applied, polling while art is still pending. */
export function useArtTitles(shelf: DefaultShelf[], settled: boolean) {
  const lookup = useMemo(() => lookupTitles(shelf), [shelf]);
  const apiOn = Boolean(import.meta.env.VITE_API_URL);
  const queryClient = useQueryClient();
  const artKey = ['home-art', lookup];
  const art = useQuery({
    queryKey: artKey,
    queryFn: ({ signal }) =>
      fetchHomeArt(lookup, { env: import.meta.env, signal }),
    enabled: settled && lookup.length > 0 && apiOn,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      artPollDelay(query.state.data?.pending, query.state.dataUpdateCount),
  });
  const pollsLeft =
    art.isPlaceholderData ||
    artSkeletonLeft(queryClient.getQueryState(artKey)?.dataUpdateCount ?? 0);
  return useMemo(() => {
    const applied = art.data
      ? applyRatings(applyHomeArt(shelf, art.data.paths), art.data.ratings)
      : shelf;
    const [marked] = markArtPending(applied, {
      apiOn,
      art: art.data,
      pollsLeft,
      failed: art.isError,
      sent: new Set(lookup.map((t) => t.slug)),
    });
    return marked?.items ?? shelf[0]?.items ?? [];
  }, [shelf, lookup, art.data, art.isError, apiOn, pollsLeft]);
}
