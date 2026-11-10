import type { PlayerSource, ResolvedStream, StreamKind } from './source.ts';

export const REPLAY_SAMPLES = {
  mp4: '/fixtures/sample.mp4',
  hls: '/fixtures/sample-hls/index.m3u8',
} as const satisfies Record<StreamKind, string>;

export class ReplayPlayerSource implements PlayerSource {
  private readonly kind: StreamKind;

  constructor(kind: StreamKind = 'mp4') {
    this.kind = kind;
  }

  async resolve(): Promise<ResolvedStream> {
    return { url: REPLAY_SAMPLES[this.kind], kind: this.kind };
  }
}
