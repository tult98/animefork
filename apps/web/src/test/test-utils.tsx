import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render as rtlRender,
  renderHook as rtlRenderHook,
  type RenderHookOptions,
  type RenderOptions,
} from '@testing-library/react';
import { Fragment, StrictMode, type ReactElement, type ReactNode } from 'react';
import { PlayerSourceProvider } from '../lib/player/context.tsx';
import { ReplayPlayerSource } from '../lib/player/replay-player-source.ts';
import { TransportProvider } from '../lib/transport/index.ts';
import { FetchTransport } from './fetch-transport.ts';

interface Providers {
  strict?: boolean;
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

// Everything a component reads from context. Every request it makes goes through global fetch, so the test sets the answer with fetchMock.
function providers({ strict = false }: Providers = {}) {
  const queryClient = newQueryClient();
  const transport = new FetchTransport();
  const Mode = strict ? StrictMode : Fragment;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Mode>
        <TransportProvider transport={transport}>
          <PlayerSourceProvider source={new ReplayPlayerSource('mp4')}>
            <QueryClientProvider client={queryClient}>
              {children}
            </QueryClientProvider>
          </PlayerSourceProvider>
        </TransportProvider>
      </Mode>
    );
  };
}

export function render(
  ui: ReactElement,
  options: Omit<RenderOptions, 'wrapper'> & Providers = {},
) {
  const { strict, ...rest } = options;
  return rtlRender(ui, { wrapper: providers({ strict }), ...rest });
}

export function renderHook<Result, Props>(
  hook: (props: Props) => Result,
  options: Omit<RenderHookOptions<Props>, 'wrapper'> & Providers = {},
) {
  const { strict, ...rest } = options;
  return rtlRenderHook(hook, { wrapper: providers({ strict }), ...rest });
}

export * from '@testing-library/react';
