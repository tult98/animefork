import { useQuery } from '@tanstack/react-query';
import type {
  WatchProgressShelfItem,
  WatchProgressShelfResponse,
} from '../../../../api/src/watch-progress/contract.ts';
import { api } from '../api/client.ts';
import { useSession } from '../auth/session.ts';

export const CONTINUE_ROWS_KEY = ['continue-rows'] as const;

export interface ContinueRows {
  // True only while a signed-in viewer's request is in flight, so nobody else sees a skeleton.
  loading: boolean;
  rows: WatchProgressShelfItem[] | undefined;
}

export function useContinueRows(): ContinueRows {
  const session = useSession();
  const signedIn = session.state === 'signedIn';
  const query = useQuery({
    queryKey: [...CONTINUE_ROWS_KEY, signedIn && session.user.id],
    queryFn: ({ signal }) =>
      api
        .get('v1/watch-progress', { signal })
        .json<WatchProgressShelfResponse>()
        .then((body) => body.items),
    enabled: signedIn,
  });
  return {
    loading: signedIn && query.isLoading,
    rows: signedIn ? query.data : undefined,
  };
}
