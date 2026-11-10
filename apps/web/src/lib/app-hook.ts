import type { QueryClient } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import type { Transport } from './transport/index.ts';

export interface AppHook {
  route: () => string;
  queryKeys: () => readonly (readonly unknown[])[];
  transport: Transport;
}

declare global {
  interface Window {
    __app?: AppHook;
  }
}

export function installAppHook(deps: {
  router: AnyRouter;
  queryClient: QueryClient;
  transport: Transport;
}): void {
  window.__app = {
    route: () => deps.router.state.location.pathname,
    queryKeys: () =>
      deps.queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    transport: deps.transport,
  };
}
