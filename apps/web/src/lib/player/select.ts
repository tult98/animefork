import { selectTransportKind } from '../transport/index.ts';
import type { TransportEnv } from '../transport/select.ts';
import { ExtensionPlayerSource } from './extension-player-source.ts';
import { ReplayPlayerSource } from './replay-player-source.ts';
import type { PlayerSource } from './source.ts';

export function createPlayerSource(
  search: string,
  env: TransportEnv,
): PlayerSource {
  if (selectTransportKind(search, env) !== 'replay') {
    return new ExtensionPlayerSource();
  }
  const sample = new URLSearchParams(search).get('sample');
  return new ReplayPlayerSource(sample === 'hls' ? 'hls' : 'mp4');
}
