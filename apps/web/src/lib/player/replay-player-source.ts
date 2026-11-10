import type { PlayerSource, ResolvedStream } from './source.ts';

export const REPLAY_SAMPLE_URL = '/fixtures/sample.mp4';

export class ReplayPlayerSource implements PlayerSource {
  async resolve(): Promise<ResolvedStream> {
    return { url: REPLAY_SAMPLE_URL, kind: 'mp4' };
  }
}
