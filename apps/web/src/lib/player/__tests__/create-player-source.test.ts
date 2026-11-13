import { describe, expect, it } from 'vitest';
import { ExtensionPlayerSource } from '../extension-player-source.ts';
import { ReplayPlayerSource, REPLAY_SAMPLES } from '../replay-player-source.ts';
import { createPlayerSource } from '../select.ts';

const episode = { id: '72839', play: 'api', hash: 'abc' };

describe('createPlayerSource', () => {
  it('serves the bundled mp4 sample under ?transport=replay', async () => {
    const source = createPlayerSource('?transport=replay', {});

    expect(source).toBeInstanceOf(ReplayPlayerSource);
    await expect(source.resolve(episode)).resolves.toEqual({
      url: REPLAY_SAMPLES.mp4,
      kind: 'mp4',
    });
  });

  it('serves the HLS sample under ?transport=replay&sample=hls', async () => {
    const source = createPlayerSource('?transport=replay&sample=hls', {});

    await expect(source.resolve(episode)).resolves.toEqual({
      url: REPLAY_SAMPLES.hls,
      kind: 'hls',
    });
  });

  it('defaults to the extension source', () => {
    expect(createPlayerSource('', {})).toBeInstanceOf(ExtensionPlayerSource);
  });
});
