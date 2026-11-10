import {
  ExtensionTransport,
  loadExtensionHttp,
} from './extension-transport.ts';
import { ReplayTransport } from './replay-transport.ts';
import type { Transport } from './types.ts';

export type TransportKind = 'extension' | 'replay';

export interface TransportEnv {
  VITE_TRANSPORT?: string;
  VITE_UPSTREAM_ORIGIN?: string;
}

export function selectTransportKind(
  search: string,
  env: TransportEnv,
): TransportKind {
  const fromQuery = new URLSearchParams(search).get('transport');
  const choice = fromQuery ?? env.VITE_TRANSPORT;
  return choice === 'replay' ? 'replay' : 'extension';
}

export function createTransport(search: string, env: TransportEnv): Transport {
  if (selectTransportKind(search, env) === 'replay') {
    const set = new URLSearchParams(search).get('fixtures') ?? 'default';
    return new ReplayTransport({
      baseUrl: `/fixtures/${encodeURIComponent(set)}`,
    });
  }
  return new ExtensionTransport({
    loadHttp: loadExtensionHttp,
    origin: env.VITE_UPSTREAM_ORIGIN,
  });
}
