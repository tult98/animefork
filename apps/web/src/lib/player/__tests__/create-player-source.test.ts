import { describe, expect, it } from 'vitest';
import { FetchTransport } from '../../../test/fetch-transport.ts';
import { ExtensionPlayerSource } from '../extension-player-source.ts';
import { ReplayPlayerSource, REPLAY_SAMPLES } from '../replay-player-source.ts';
import { createPlayerSource } from '../select.ts';

const episode = { id: '72839', play: 'api', hash: 'abc' };
const transport = new FetchTransport();

describe('createPlayerSource', () => {
  it('serves the bundled mp4 sample under ?transport=replay', async () => {
    const source = createPlayerSource('?transport=replay', {}, transport);

    expect(source).toBeInstanceOf(ReplayPlayerSource);
    await expect(source.resolve(episode)).resolves.toEqual({
      url: REPLAY_SAMPLES.mp4,
      kind: 'mp4',
    });
  });

  it('serves the HLS sample under ?transport=replay&sample=hls', async () => {
    const source = createPlayerSource(
      '?transport=replay&sample=hls',
      {},
      transport,
    );

    await expect(source.resolve(episode)).resolves.toEqual({
      url: REPLAY_SAMPLES.hls,
      kind: 'hls',
    });
  });

  it('defaults to the extension source', () => {
    expect(createPlayerSource('', {}, transport)).toBeInstanceOf(
      ExtensionPlayerSource,
    );
  });
});
