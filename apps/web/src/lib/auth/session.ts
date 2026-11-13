import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuthUser,
  UserResponse,
} from '../../../../api/src/auth/contract.ts';
import { api } from '../api/client.ts';

export const SESSION_KEY = ['session'] as const;

export type Session =
  | { state: 'loading' }
  | { state: 'signedOut' }
  | { state: 'signedIn'; user: AuthUser };

export function useSession(): Session {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: ({ signal }) =>
      api
        .get('v1/auth/me', { signal })
        .json<UserResponse>()
        .then((body): AuthUser | null => body.user),
    // Sign-in and sign-out write the answer themselves, so a refetch would only race them.
    staleTime: Infinity,
    retryOnMount: false,
  });
  if (query.isPending) return { state: 'loading' };
  if (query.isError || !query.data) return { state: 'signedOut' };
  return { state: 'signedIn', user: query.data };
}

export function useSessionActions() {
  const queryClient = useQueryClient();
  const signOutMutation = useMutation({
    mutationFn: () => api.post('v1/auth/sign-out'),
    onSuccess: () => queryClient.setQueryData(SESSION_KEY, null),
    // The cookie may still be live, so the server decides what the header shows.
    onError: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  });
  return {
    setUser: (user: AuthUser) => queryClient.setQueryData(SESSION_KEY, user),
    signOut: () => signOutMutation.mutateAsync().catch(() => undefined),
  };
}
