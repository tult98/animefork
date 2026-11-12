import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '../../../../api/src/auth/contract.ts';
import { me, signOut } from './client.ts';

export const SESSION_KEY = ['session'] as const;

export type Session =
  | { state: 'loading' }
  | { state: 'signedOut' }
  | { state: 'signedIn'; user: AuthUser };

export function useSession(): Session {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: ({ signal }) => me(signal),
    // Sign-in and sign-out write the answer themselves, so a refetch would only race them.
    staleTime: Infinity,
  });
  if (query.isPending) return { state: 'loading' };
  return query.data
    ? { state: 'signedIn', user: query.data }
    : { state: 'signedOut' };
}

export function useSessionActions() {
  const queryClient = useQueryClient();
  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: (result) => {
      if (result.ok) queryClient.setQueryData(SESSION_KEY, null);
      // The cookie may still be live, so the server decides what the header shows.
      else void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    },
  });
  return {
    setUser: (user: AuthUser) => queryClient.setQueryData(SESSION_KEY, user),
    signOut: () => signOutMutation.mutateAsync(),
  };
}
