import type { PlayerSource, ResolvedStream } from '../lib/player/source.ts';

// jsdom never loads media, so the URL only has to be a well-formed mp4 address.
export class ReplayPlayerSource implements PlayerSource {
  async resolve(): Promise<ResolvedStream> {
    return { url: 'https://media.invalid/sample.mp4', kind: 'mp4' };
  }
}
