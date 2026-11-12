import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installAppHook } from './lib/app-hook.ts';
import { PlayerSourceProvider } from './lib/player/context.tsx';
import { ExtensionPlayerSource } from './lib/player/extension-player-source.ts';
import {
  ExtensionTransport,
  TransportProvider,
  loadExtensionHttp,
} from './lib/transport/index.ts';
import { routeTree } from './routeTree.gen.ts';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const transport = new ExtensionTransport({
  loadHttp: loadExtensionHttp,
  origin: import.meta.env.VITE_UPSTREAM_ORIGIN,
});
const playerSource = new ExtensionPlayerSource({ transport });
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

if (import.meta.env.DEV) installAppHook({ router, queryClient, transport });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TransportProvider transport={transport}>
      <PlayerSourceProvider source={playerSource}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </PlayerSourceProvider>
    </TransportProvider>
  </StrictMode>,
);
