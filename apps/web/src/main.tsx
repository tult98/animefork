import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installAppHook } from './lib/app-hook.ts';
import { PlayerSourceProvider } from './lib/player/context.tsx';
import { createPlayerSource } from './lib/player/select.ts';
import { TransportProvider, createTransport } from './lib/transport/index.ts';
import { routeTree } from './routeTree.gen.ts';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const transport = createTransport(window.location.search, import.meta.env);
const playerSource = createPlayerSource(
  window.location.search,
  import.meta.env,
  transport,
);
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
