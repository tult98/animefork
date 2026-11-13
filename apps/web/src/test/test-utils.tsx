import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import {
  act,
  waitFor,
  render as rtlRender,
  renderHook as rtlRenderHook,
  type RenderHookOptions,
  type RenderOptions,
} from '@testing-library/react';
import type { CallHistoryFilter, FetchMock, UserRouteConfig } from 'fetch-mock';
import { expect } from 'vitest';
import { Fragment, StrictMode, type ReactElement, type ReactNode } from 'react';
import { DetailsProvider } from '../components/details/details-context.tsx';
import { PlayerSourceProvider } from '../lib/player/context.tsx';
import { ReplayPlayerSource } from '../lib/player/replay-player-source.ts';

interface Providers {
  strict?: boolean;
}

interface RenderUiOptions extends Providers {
  // Starts a memory router at this URL, for a component that uses Link or useNavigate. Its first paint is async, so find the element with findBy*. The router comes back to check where navigation ended.
  path?: string;
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

// Everything a component reads from context. Every request it makes goes through global fetch, so the test sets the answer with fetchMock.
function providers({ strict = false }: Providers = {}) {
  const queryClient = newQueryClient();
  const Mode = strict ? StrictMode : Fragment;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Mode>
        <PlayerSourceProvider source={new ReplayPlayerSource('mp4')}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </PlayerSourceProvider>
      </Mode>
    );
  };
}

export function render(
  ui: ReactElement,
  options: Omit<RenderOptions, 'wrapper'> & RenderUiOptions = {},
) {
  const { strict, path, ...rest } = options;
  // The details modal opens from cards and the hero, so every component renders inside its provider.
  const tree = <DetailsProvider>{ui}</DetailsProvider>;
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => tree,
      notFoundComponent: () => null,
    }),
    history: createMemoryHistory({ initialEntries: [path ?? '/'] }),
  });
  const result = rtlRender(
    path === undefined ? tree : <RouterProvider router={router} />,
    { wrapper: providers({ strict }), ...rest },
  );
  return { ...result, router };
}

export function renderHook<Result, Props>(
  hook: (props: Props) => Result,
  options: Omit<RenderHookOptions<Props>, 'wrapper'> & Providers = {},
) {
  const { strict, ...rest } = options;
  return rtlRenderHook(hook, { wrapper: providers({ strict }), ...rest });
}

export * from '@testing-library/react';
export { intersectAll } from './intersection-observer.ts';

declare module 'vitest' {
  interface Assertion {
    toBeFetched(
      filter?: CallHistoryFilter,
      options?: UserRouteConfig,
    ): Promise<void>;
  }
}

// A line per request the test made, so a failure shows what was sent instead of what was expected.
function requestsMade(fetchMock: FetchMock) {
  const calls = fetchMock.callHistory.calls();
  if (calls.length === 0) return '  none';
  return calls
    .map(
      ({ url, options }) =>
        `  ${(options.method ?? 'get').toUpperCase()} ${url}${options.body ? ` ${String(options.body)}` : ''}`,
    )
    .join('\n');
}

// Waits until the request was made and answered and React has drawn the answer, so the next line can query the UI without waiting.
expect.extend({
  async toBeFetched(
    received: FetchMock,
    filter?: CallHistoryFilter,
    options?: UserRouteConfig,
  ) {
    const wanted = [filter, options && JSON.stringify(options)]
      .filter(Boolean)
      .join(' ');
    try {
      await waitFor(() => expect(received).toHaveFetched(filter, options), {
        timeout: 2_000,
      });
    } catch {
      return {
        pass: false,
        message: () =>
          `expected a request matching ${wanted}\nrequests made:\n${requestsMade(received)}`,
      };
    }
    await received.callHistory.flush(true);
    await act(async () => {});
    return {
      pass: true,
      message: () =>
        `expected no request matching ${wanted}\nrequests made:\n${requestsMade(received)}`,
    };
  },
});
