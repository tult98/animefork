import { createContext, use, type ReactNode } from 'react';
import type { Transport } from './types.ts';

const TransportContext = createContext<Transport | null>(null);

export function TransportProvider({
  transport,
  children,
}: {
  transport: Transport;
  children: ReactNode;
}) {
  return <TransportContext value={transport}>{children}</TransportContext>;
}

export function useTransport(): Transport {
  const transport = use(TransportContext);
  if (!transport) throw new Error('useTransport needs a TransportProvider');
  return transport;
}
