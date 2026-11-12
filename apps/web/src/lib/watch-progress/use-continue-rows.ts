import type {
  WatchProgressShelfItem,
  WatchProgressShelfResponse,
} from '../../../../api/src/watch-progress/contract.ts';
import { useApiQuery } from '../api/use-api-query.ts';
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
  const query = useApiQuery<
    WatchProgressShelfResponse,
    WatchProgressShelfItem[]
  >({
    key: [...CONTINUE_ROWS_KEY, signedIn && session.user.id],
    endpoint: '/v1/watch-progress',
    map: (body) => body.items,
    enabled: signedIn,
  });
  return {
    loading: signedIn && query.isLoading,
    rows: signedIn ? query.data : undefined,
  };
}
