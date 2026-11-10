import { describe, expect, it, vi } from 'vitest';
import type { Transport } from '../transport/index.ts';
import { TransportStatusError } from '../transport/index.ts';
import { StreamUnavailableError } from './errors.ts';
import { ExtensionPlayerSource } from './extension-player-source.ts';
import { createPlayerSource } from './select.ts';
import {
  ReplayPlayerSource,
  REPLAY_SAMPLE_URL,
} from './replay-player-source.ts';

const episode = { id: '72839', play: 'api', hash: 'abc' };

function transportAnswering(body: unknown, status = 200) {
  const post = vi.fn().mockResolvedValue({
    status,
    data: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { transport: { get: vi.fn(), post } as unknown as Transport, post };
}

describe('ExtensionPlayerSource', () => {
  it('posts the episode keys to /ajax/player', async () => {
    const { transport, post } = transportAnswering({
      link: [{ file: '//cdn.example/a.mp4', type: 'mp4' }],
      playTech: 'api',
    });
    await new ExtensionPlayerSource({ transport }).resolve(episode);
    expect(post).toHaveBeenCalledWith({
      url: '/ajax/player',
      data: { id: '72839', play: 'api', link: 'abc', backuplinks: '1' },
      signal: undefined,
    });
  });

  it('adds https to a protocol-relative file and reads the type', async () => {
    const { transport } = transportAnswering({
      link: [{ file: '//cdn.example/a.m3u8', type: 'hls' }],
    });
    await expect(
      new ExtensionPlayerSource({ transport }).resolve(episode),
    ).resolves.toEqual({ url: 'https://cdn.example/a.m3u8', kind: 'hls' });
  });

  it('treats an untyped absolute file as a progressive mp4', async () => {
    const { transport } = transportAnswering({
      link: [{ file: 'https://cdn.example/a.mp4' }],
    });
    await expect(
      new ExtensionPlayerSource({ transport }).resolve(episode),
    ).resolves.toEqual({ url: 'https://cdn.example/a.mp4', kind: 'mp4' });
  });

  it('decrypts a bare file into a data URL playlist', async () => {
    const { transport } = transportAnswering({ link: [{ file: 'cipher' }] });
    const decryptM3u8 = vi.fn().mockResolvedValue('#EXTM3U\n');
    const stream = await new ExtensionPlayerSource({
      transport,
      decryptM3u8,
    }).resolve(episode);
    expect(decryptM3u8).toHaveBeenCalledWith('cipher');
    expect(stream).toEqual({
      url: `data:application/vnd.apple.mpegurl;base64,${btoa('#EXTM3U\n')}`,
      kind: 'hls',
    });
  });

  it('builds the playlist URL from an iframe player page', async () => {
    const { transport } = transportAnswering({
      link: 'https://stream.example/embed/1',
      playTech: 'iframe',
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '<script src="/static/avs-loader.min.js?v=1.35.2"></script><script>var id = "pl9"; var avsToken = "tok.en";</script>',
        ),
      );
    const stream = await new ExtensionPlayerSource({
      transport,
      fetchImpl,
    }).resolve(episode);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://stream.example/embed/1#animevsub-vsub_extrao',
    );
    const url = new URL(stream.url);
    expect(stream.kind).toBe('hls');
    expect(url.origin + url.pathname).toBe(
      'https://stream.example/playlist/pl9/playlist.m3u8',
    );
    expect(url.searchParams.get('token')).toBe('tok.en');
    expect(url.searchParams.get('fc')).toBe(btoa('cross-origin'));
    expect(url.hash).toBe('');
  });

  it('fails when the player page carries no token', async () => {
    const { transport } = transportAnswering({
      link: 'https://stream.example/embed/1',
      playTech: 'iframe',
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<p>none</p>'));
    await expect(
      new ExtensionPlayerSource({ transport, fetchImpl }).resolve(episode),
    ).rejects.toBeInstanceOf(StreamUnavailableError);
  });

  it('fails when the server has no link', async () => {
    const { transport } = transportAnswering({ link: '' });
    await expect(
      new ExtensionPlayerSource({ transport }).resolve(episode),
    ).rejects.toBeInstanceOf(StreamUnavailableError);
  });

  it('fails on a body that is not JSON', async () => {
    const { transport } = transportAnswering('<html>blocked</html>');
    await expect(
      new ExtensionPlayerSource({ transport }).resolve(episode),
    ).rejects.toBeInstanceOf(StreamUnavailableError);
  });

  it('passes a bad status through', async () => {
    const { transport } = transportAnswering('', 403);
    await expect(
      new ExtensionPlayerSource({ transport }).resolve(episode),
    ).rejects.toBeInstanceOf(TransportStatusError);
  });
});

describe('createPlayerSource', () => {
  const transport = { get: vi.fn(), post: vi.fn() } as unknown as Transport;

  it('serves the bundled sample under ?transport=replay', async () => {
    const source = createPlayerSource('?transport=replay', {}, transport);
    expect(source).toBeInstanceOf(ReplayPlayerSource);
    await expect(source.resolve(episode)).resolves.toEqual({
      url: REPLAY_SAMPLE_URL,
      kind: 'mp4',
    });
  });

  it('defaults to the extension source', () => {
    expect(createPlayerSource('', {}, transport)).toBeInstanceOf(
      ExtensionPlayerSource,
    );
  });
});
