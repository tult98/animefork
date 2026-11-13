import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { HTTPError } from 'ky';
import { StreamUnavailableError } from '../errors.ts';
import { ExtensionPlayerSource } from '../extension-player-source.ts';

const episode = { id: '72839', play: 'api', hash: 'abc' };

describe('the extension player source', () => {
  it('resolves a direct stream, adding https to a protocol-relative file', async () => {
    fetchMock.post('path:/ajax/player', {
      link: [{ file: '//cdn.example/a.m3u8', type: 'hls' }],
      playTech: 'api',
    });

    await expect(new ExtensionPlayerSource().resolve(episode)).resolves.toEqual(
      {
        url: 'https://cdn.example/a.m3u8',
        kind: 'hls',
      },
    );
    expect(fetchMock).toHavePosted('path:/ajax/player');
  });

  it('builds the playlist URL from the id and token of an iframe player page', async () => {
    fetchMock
      .post('path:/ajax/player', {
        link: 'https://stream.example/embed/1',
        playTech: 'iframe',
      })
      .get(
        'path:/embed/1',
        '<script src="/static/avs-loader.min.js?v=1.35.2"></script><script>var id = "pl9"; var avsToken = "tok.en";</script>',
      );

    const stream = await new ExtensionPlayerSource({}).resolve(episode);

    const url = new URL(stream.url);
    expect(stream.kind).toBe('hls');
    expect(url.origin + url.pathname).toBe(
      'https://stream.example/playlist/pl9/playlist.m3u8',
    );
    expect(url.searchParams.get('token')).toBe('tok.en');
    expect(url.searchParams.get('fc')).toBe(btoa('cross-origin'));
    expect(url.hash).toBe('');
  });

  it('fails when the player page has no id or token', async () => {
    fetchMock
      .post('path:/ajax/player', {
        link: 'https://stream.example/embed/1',
        playTech: 'iframe',
      })
      .get('path:/embed/1', '<p>none</p>');

    await expect(new ExtensionPlayerSource().resolve(episode)).rejects.toThrow(
      new StreamUnavailableError('Player page has no id or avsToken.'),
    );
  });

  it('fails clearly when the server has no stream or sends a page instead of JSON', async () => {
    fetchMock.post('path:/ajax/player', { link: '' }, { repeat: 1 });
    await expect(new ExtensionPlayerSource().resolve(episode)).rejects.toThrow(
      'This server has no stream.',
    );

    fetchMock.post('path:/ajax/player', '<html>blocked</html>');
    await expect(
      new ExtensionPlayerSource().resolve(episode),
    ).rejects.toBeInstanceOf(StreamUnavailableError);
  });

  it('fails with the status when the source answers with an error', async () => {
    fetchMock.post('path:/ajax/player', 403);

    await expect(
      new ExtensionPlayerSource().resolve(episode),
    ).rejects.toBeInstanceOf(HTTPError);
  });
});
