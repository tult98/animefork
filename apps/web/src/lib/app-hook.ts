import type { QueryClient } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import type { HomeShelves } from './titles/shelves.ts';
import type { Transport } from './transport/index.ts';

export interface RenderedShelf {
  id: string;
  paths: string[];
}

export interface AppHook {
  route: () => string;
  queryKeys: () => readonly (readonly unknown[])[];
  shelves: () => RenderedShelf[];
  transport: Transport;
}

declare global {
  interface Window {
    __app?: AppHook;
  }
}

let rendered: HomeShelves = [];

export function publishShelves(shelves: HomeShelves): void {
  rendered = shelves;
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
    shelves: () =>
      rendered.map((shelf) => ({
        id: shelf.id,
        paths: shelf.items.map((title) => title.path),
      })),
    transport: deps.transport,
  };
}
