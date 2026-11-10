import { createContext, use, type ReactNode } from 'react';
import type { PlayerSource } from './source.ts';

const PlayerSourceContext = createContext<PlayerSource | null>(null);

export function PlayerSourceProvider({
  source,
  children,
}: {
  source: PlayerSource;
  children: ReactNode;
}) {
  return <PlayerSourceContext value={source}>{children}</PlayerSourceContext>;
}

export function usePlayerSource(): PlayerSource {
  const source = use(PlayerSourceContext);
  if (!source) throw new Error('usePlayerSource needs a PlayerSourceProvider');
  return source;
}
