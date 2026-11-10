import { z } from 'zod';
import { expectOk, type Transport } from '../transport/index.ts';
import { noteLoaderVersion } from './avs-playlist.ts';
import { StreamUnavailableError } from './errors.ts';
import type {
  PlayerSource,
  ResolvedStream,
  StreamKind,
  StreamRequest,
} from './source.ts';

// The helper extension matches this fragment to set Referer and CORS on the iframe server's requests.
// hls.js appends its own copy before it fetches the playlist, so the playlist URL built here stays untagged.
const VSUB_TAG = '#animevsub-vsub_extrao';
const RE_PLAYER_ID = /id\s*=\s*"([^"]+)"/;
const RE_AVS_TOKEN = /avsToken\s*=\s*"([^"]+)"/;
const RE_AVS_LOADER_VERSION = /\/static\/avs-loader(?:\.min)?\.js\?v=([\d.]+)/;
const HLS_TYPES = new Set(['hls', 'm3u', 'm3u8']);

const PlayerResponseSchema = z.object({
  link: z.union([
    z.string(),
    z.array(
      z.object({
        file: z.string(),
        type: z.string().optional(),
      }),
    ),
  ]),
  playTech: z.string().optional(),
});

export interface ExtensionPlayerSourceOptions {
  transport: Transport;
  fetchImpl?: typeof fetch;
  decryptM3u8?: (encrypted: string) => Promise<string>;
}

async function loadDecryptor(): Promise<
  (encrypted: string) => Promise<string>
> {
  const { init, decryptM3u8 } = await import('./decrypt-hls.ts');
  await init();
  return (encrypted) => decryptM3u8(encrypted);
}

export class ExtensionPlayerSource implements PlayerSource {
  private readonly transport: Transport;
  private readonly fetchImpl: typeof fetch;
  private readonly decryptM3u8: (encrypted: string) => Promise<string>;

  constructor({
    transport,
    fetchImpl = (...args) => fetch(...args),
    decryptM3u8,
  }: ExtensionPlayerSourceOptions) {
    this.transport = transport;
    this.fetchImpl = fetchImpl;
    this.decryptM3u8 = decryptM3u8 ?? decryptLazily;
  }

  async resolve(
    { id, play, hash }: StreamRequest,
    signal?: AbortSignal,
  ): Promise<ResolvedStream> {
    const res = await this.transport.post({
      url: '/ajax/player',
      data: { id, play, link: hash, backuplinks: '1' },
      signal,
    });
    expectOk(res, '/ajax/player');

    const parsed = PlayerResponseSchema.safeParse(safeJson(res.data));
    if (!parsed.success || !parsed.data.link) {
      throw new StreamUnavailableError('This server has no stream.');
    }
    const { link, playTech } = parsed.data;

    if (playTech === 'iframe' && typeof link === 'string') {
      return { url: await this.iframePlaylistUrl(link, signal), kind: 'hls' };
    }
    if (typeof link === 'string' || link.length === 0) {
      throw new StreamUnavailableError('This stream format is not supported.');
    }
    return this.fromItem(link[0]!);
  }

  private async fromItem({
    file,
    type,
  }: {
    file: string;
    type?: string;
  }): Promise<ResolvedStream> {
    if (file.includes('://') || file.startsWith('//')) {
      const url = file.startsWith('http') ? file : `https:${file}`;
      return { url, kind: kindOf(type) };
    }
    const playlist = await this.decryptM3u8(file);
    return {
      url: `data:application/vnd.apple.mpegurl;base64,${btoa(playlist)}`,
      kind: 'hls',
    };
  }

  private async iframePlaylistUrl(
    playerUrl: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const page = await this.fetchImpl(playerUrl + VSUB_TAG, { signal });
    if (!page.ok) {
      throw new StreamUnavailableError(`Player page answered ${page.status}.`);
    }
    const html = await page.text();
    noteLoaderVersion(RE_AVS_LOADER_VERSION.exec(html)?.[1] ?? null);

    const id = RE_PLAYER_ID.exec(html)?.[1];
    const token = RE_AVS_TOKEN.exec(html)?.[1];
    if (!id || !token) {
      throw new StreamUnavailableError('Player page has no id or avsToken.');
    }

    const playlist = new URL(`/playlist/${id}/playlist.m3u8`, playerUrl);
    playlist.searchParams.set('token', token);
    playlist.searchParams.set('fc', btoa('cross-origin'));
    return playlist.href;
  }
}

function kindOf(type: string | undefined): StreamKind {
  return type && HLS_TYPES.has(type) ? 'hls' : 'mp4';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let decryptor: Promise<(encrypted: string) => Promise<string>> | undefined;
function decryptLazily(encrypted: string): Promise<string> {
  decryptor ??= loadDecryptor();
  return decryptor.then((decrypt) => decrypt(encrypted));
}
