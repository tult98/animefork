import { useQuery } from '@tanstack/react-query';
import type { LibraryResponse } from '../../../../api/src/library/contract.ts';
import { api } from '../api/client.ts';
import { useSession } from '../auth/session.ts';

export const libraryKey = (userId: string | false) =>
  ['library', userId] as const;

export type Library =
  | { status: 'pending' }
  // Signed out: the viewer has no ratings and no playlists to show.
  | { status: 'none' }
  | { status: 'failed'; error: unknown; retry: () => void }
  | { status: 'ready'; library: LibraryResponse };

export function useLibrary(): Library {
  const session = useSession();
  const signedIn = session.state === 'signedIn';
  const query = useQuery({
    queryKey: libraryKey(signedIn && session.user.id),
    queryFn: ({ signal }) =>
      api.get('v1/library', { signal }).json<LibraryResponse>(),
    enabled: signedIn,
  });
  if (session.state === 'loading') return { status: 'pending' };
  if (session.state === 'signedOut') return { status: 'none' };
  if (query.data) return { status: 'ready', library: query.data };
  if (query.isError) {
    return {
      status: 'failed',
      error: query.error,
      retry: () => void query.refetch(),
    };
  }
  return { status: 'pending' };
}
