import {
  useQuery,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import { apiGet } from './request.ts';

export interface ApiQueryOptions<T, TData> {
  key: QueryKey;
  endpoint: string;
  // Not `select`: setQueryData callers write the mapped shape into the cache, so the cache must hold it.
  map?: (data: T) => TData;
  enabled?: boolean;
}

export function useApiQuery<T, TData = T>({
  key,
  endpoint,
  map,
  enabled,
}: ApiQueryOptions<T, TData>): UseQueryResult<TData> {
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const body = await apiGet<T>(endpoint, signal);
      return map ? map(body) : (body as unknown as TData);
    },
    enabled,
  });
}
