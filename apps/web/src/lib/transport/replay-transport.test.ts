import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtureFileFor } from './fixture-path.ts';
import { TransportNetworkError } from './errors.ts';
import { ReplayTransport } from './replay-transport.ts';

const publicDir = fileURLToPath(new URL('../../../public', import.meta.url));

const diskFetch: typeof fetch = async (input) => {
  try {
    const body = await readFile(`${publicDir}${String(input)}`, 'utf8');
    return new Response(body, { status: 200 });
  } catch {
    return new Response('missing', { status: 404 });
  }
};

describe('fixtureFileFor', () => {
  it.each([
    ['/', 'index.html'],
    ['https://host.example/', 'index.html'],
    ['/the-loai/hanh-dong/', 'the-loai/hanh-dong.html'],
    ['/ajax/item?x=1#frag', 'ajax/item.html'],
    ['/static/data.json', 'static/data.json'],
  ])('maps %s to %s', (url, file) => {
    expect(fixtureFileFor(url)).toBe(file);
  });
});

describe('ReplayTransport', () => {
  it('serves the committed home fixture by URL path', async () => {
    const res = await new ReplayTransport({ fetchImpl: diskFetch }).get({
      url: '/',
    });
    expect(res.status).toBe(200);
    expect(res.data).toContain('Psyren');
  });

  it('serves a POST by path and ignores the body', async () => {
    const res = await new ReplayTransport({ fetchImpl: diskFetch }).post({
      url: '/',
      data: { a: 1 },
    });
    expect(res.status).toBe(200);
  });

  it('passes a missing fixture through as status 404', async () => {
    const res = await new ReplayTransport({ fetchImpl: diskFetch }).get({
      url: '/nope/',
    });
    expect(res.status).toBe(404);
  });

  it('reads from the configured fixture set', async () => {
    const res = await new ReplayTransport({
      baseUrl: '/fixtures/invalid-title/',
      fetchImpl: diskFetch,
    }).get({ url: '/' });
    expect(res.data).toContain('not-a-number');
  });

  it('asks for text/plain so a dev server cannot answer a missing file with index.html', async () => {
    let seen: HeadersInit | undefined;
    const transport = new ReplayTransport({
      fetchImpl: async (_input, init) => {
        seen = init?.headers;
        return new Response('x');
      },
    });
    await transport.get({ url: '/' });
    expect(seen).toEqual({ Accept: 'text/plain' });
  });

  it('wraps a failed fetch in TransportNetworkError', async () => {
    const transport = new ReplayTransport({
      fetchImpl: () => Promise.reject(new TypeError('offline')),
    });
    await expect(transport.get({ url: '/' })).rejects.toBeInstanceOf(
      TransportNetworkError,
    );
  });
});
