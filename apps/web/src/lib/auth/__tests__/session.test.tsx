// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { jsonResponse, stubAuth, user } from '../../../test/auth-stub.ts';
import { useSession, useSessionActions } from '../session.ts';

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function setup() {
  const wrapper = wrapperFor(newClient());
  return renderHook(
    () => ({ session: useSession(), actions: useSessionActions() }),
    { wrapper },
  );
}

describe('useSession', () => {
  it('is loading, then signed in when /me answers a user', async () => {
    stubAuth({ me: () => jsonResponse(200, { user }) });
    const { result } = setup();
    expect(result.current.session).toEqual({ state: 'loading' });
    await waitFor(() =>
      expect(result.current.session).toEqual({ state: 'signedIn', user }),
    );
  });

  it('is signed out on a 401', async () => {
    stubAuth();
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.session).toEqual({ state: 'signedOut' }),
    );
  });

  it('is signed out without an API, with no request', async () => {
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.session).toEqual({ state: 'signedOut' }),
    );
  });

  it('does not ask /me again when a reader mounts after a 401', async () => {
    const stub = stubAuth();
    const wrapper = wrapperFor(newClient());
    const first = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(first.result.current.state).toBe('signedOut'));
    first.unmount();
    const second = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(second.result.current.state).toBe('signedOut'));
    expect(stub.to('me')).toHaveLength(1);
  });

  it('takes the user from setUser and drops it on sign-out', async () => {
    stubAuth({ signOut: () => new Response(null, { status: 204 }) });
    const { result } = setup();
    await waitFor(() => expect(result.current.session.state).toBe('signedOut'));
    act(() => void result.current.actions.setUser(user));
    await waitFor(() =>
      expect(result.current.session).toEqual({ state: 'signedIn', user }),
    );
    await act(() => result.current.actions.signOut());
    await waitFor(() =>
      expect(result.current.session).toEqual({ state: 'signedOut' }),
    );
  });

  it('asks the server again when sign-out fails', async () => {
    let signedIn = true;
    const stub = stubAuth({
      me: () =>
        signedIn
          ? jsonResponse(200, { user })
          : jsonResponse(401, { error: 'unauthenticated' }),
      signOut: () => {
        signedIn = false;
        return jsonResponse(500, {});
      },
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.session.state).toBe('signedIn'));
    await act(() => result.current.actions.signOut());
    await waitFor(() => expect(result.current.session.state).toBe('signedOut'));
    expect(stub.to('me')).toHaveLength(2);
  });
});
