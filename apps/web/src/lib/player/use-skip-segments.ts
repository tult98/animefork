import type {
  SkipSegment,
  SkipTimesResponse,
} from '../../../../api/src/skip-times/contract.ts';
import { useApiQuery } from '../api/use-api-query.ts';
import { episodeNumber } from './skip-segments.ts';

const NONE: SkipSegment[] = [];
const STALE_MS = 60 * 60_000;

export function useSkipSegments(
  slug: string,
  episodeLabel: string,
): SkipSegment[] {
  const episode = episodeNumber(episodeLabel);
  const query = useApiQuery<SkipTimesResponse, SkipSegment[]>({
    key: ['skip-times', slug, episode],
    endpoint: `/v1/skip-times/${encodeURIComponent(slug)}/${episode}`,
    map: (body) => body.segments,
    enabled: episode !== undefined,
    retry: false,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });
  return query.data ?? NONE;
}
