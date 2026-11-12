import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { apiGet } from './request.ts';

export interface ApiQueryOptions<T, TData> extends Omit<
  UseQueryOptions<TData>,
  'queryKey' | 'queryFn' | 'select'
> {
  key: QueryKey;
  endpoint: string;
  // Not `select`: setQueryData callers write the mapped shape into the cache, so the cache must hold it.
  map?: (data: T) => TData;
}

export function useApiQuery<T, TData = T>({
  key,
  endpoint,
  map,
  ...options
}: ApiQueryOptions<T, TData>): UseQueryResult<TData> {
  return useQuery({
    ...options,
    queryKey: key,
    queryFn: async ({ signal }) => {
      const body = await apiGet<T>(endpoint, signal);
      return map ? map(body) : (body as unknown as TData);
    },
  });
}
