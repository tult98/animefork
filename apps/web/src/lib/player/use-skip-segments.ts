import { useQuery } from '@tanstack/react-query';
import type {
  SkipSegment,
  SkipTimesResponse,
} from '../../../../api/src/skip-times/contract.ts';
import { api } from '../api/client.ts';
import { episodeNumber } from './skip-segments.ts';

const NONE: SkipSegment[] = [];
const STALE_MS = 60 * 60_000;

export function useSkipSegments(
  slug: string,
  episodeLabel: string,
): SkipSegment[] {
  const episode = episodeNumber(episodeLabel);
  const query = useQuery({
    queryKey: ['skip-times', slug, episode],
    queryFn: ({ signal }) =>
      api
        .get(`v1/skip-times/${encodeURIComponent(slug)}/${episode}`, { signal })
        .json<SkipTimesResponse>()
        .then((body) => body.segments),
    enabled: episode !== undefined,
    retry: false,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });
  return query.data ?? NONE;
}
