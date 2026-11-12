import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { Fragment, StrictMode } from 'react';
import { ReplayPlayerSource } from '../lib/player/replay-player-source.ts';
import { PlayerSourceProvider } from '../lib/player/context.tsx';
import { routeTree } from '../routeTree.gen.ts';
import { ReplayTransport } from '../lib/transport/replay-transport.ts';
import { TransportProvider } from '../lib/transport/index.ts';
import { fixtureFetch, type FixtureOverride } from './fixture-fetch.ts';

export interface RenderedApp {
  router: ReturnType<typeof createRouter<typeof routeTree>>;
}

export async function renderApp(
  path: string,
  {
    overrides = [],
    fixtures = 'default',
    strict = false,
  }: {
    overrides?: FixtureOverride[];
    fixtures?: string;
    strict?: boolean;
  } = {},
): Promise<RenderedApp> {
  const transport = new ReplayTransport({
    baseUrl: `/fixtures/${fixtures}`,
    fetchImpl: fixtureFetch(...overrides),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const Wrapper = strict ? StrictMode : Fragment;
  render(
    <Wrapper>
      <TransportProvider transport={transport}>
        <PlayerSourceProvider source={new ReplayPlayerSource('mp4')}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </PlayerSourceProvider>
      </TransportProvider>
    </Wrapper>,
  );
  return { router };
}
