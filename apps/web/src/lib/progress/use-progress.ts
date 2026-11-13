import { useQuery } from '@tanstack/react-query';
import type {
  WatchProgressEpisode,
  WatchProgressEpisodesResponse,
} from '../../../../api/src/watch-progress/contract.ts';
import { api } from '../api/client.ts';
import { useSession } from '../auth/session.ts';

export const progressKey = (slug: string) => ['watch-progress', slug] as const;

export type ProgressRows =
  | { status: 'pending' }
  // Signed out, or the request failed: the page behaves as if nothing was ever watched.
  | { status: 'none' }
  | { status: 'ready'; rows: WatchProgressEpisode[] };

export function useProgressRows(slug: string): ProgressRows {
  const session = useSession();
  const query = useQuery({
    queryKey: progressKey(slug),
    queryFn: ({ signal }) =>
      api
        .get(`v1/watch-progress/${encodeURIComponent(slug)}`, { signal })
        .json<WatchProgressEpisodesResponse>()
        .then((body) => body.items),
    enabled: session.state === 'signedIn',
  });
  if (session.state === 'loading') return { status: 'pending' };
  if (session.state === 'signedOut') return { status: 'none' };
  if (query.data) return { status: 'ready', rows: query.data };
  return query.isError ? { status: 'none' } : { status: 'pending' };
}
