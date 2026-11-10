import { selectTransportKind, type Transport } from '../transport/index.ts';
import type { TransportEnv } from '../transport/select.ts';
import { ExtensionPlayerSource } from './extension-player-source.ts';
import { ReplayPlayerSource } from './replay-player-source.ts';
import type { PlayerSource } from './source.ts';

export function createPlayerSource(
  search: string,
  env: TransportEnv,
  transport: Transport,
): PlayerSource {
  return selectTransportKind(search, env) === 'replay'
    ? new ReplayPlayerSource()
    : new ExtensionPlayerSource({ transport });
}
