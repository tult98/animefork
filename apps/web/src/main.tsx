import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { initI18n } from './i18n/index.ts';
import { installAppHook } from './lib/app-hook.ts';
import { TransportProvider, createTransport } from './lib/transport/index.ts';
import { routeTree } from './routeTree.gen.ts';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const transport = createTransport(window.location.search, import.meta.env);
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

if (import.meta.env.DEV) installAppHook({ router, queryClient, transport });

// Render only once the locale bundles are in, so the first paint is never in the wrong language.
void initI18n().then((i18n) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <TransportProvider transport={transport}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </TransportProvider>
      </I18nextProvider>
    </StrictMode>,
  );
});
