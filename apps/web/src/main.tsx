import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installAppHook } from './lib/app-hook.ts';
import { PlayerSourceProvider } from './lib/player/context.tsx';
import { createPlayerSource } from './lib/player/select.ts';
import { routeTree } from './routeTree.gen.ts';
import './styles.css';

if (!import.meta.env.VITE_API_URL) {
  throw new Error(
    'VITE_API_URL is not set. Point it at the API service, for example http://localhost:3100 in apps/web/.env.local.',
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const playerSource = createPlayerSource(
  window.location.search,
  import.meta.env,
);
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

if (import.meta.env.DEV) installAppHook({ router, queryClient });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayerSourceProvider source={playerSource}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </PlayerSourceProvider>
  </StrictMode>,
);
