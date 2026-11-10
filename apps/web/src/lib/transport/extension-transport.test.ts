import type { HttpType } from 'client-ext-animevsub-helper';
import { describe, expect, it, vi } from 'vitest';
import { ExtensionMissingError, TransportNetworkError } from './errors.ts';
import { ExtensionTransport } from './extension-transport.ts';

function fakeHttp(overrides: Partial<HttpType> = {}) {
  const http = {
    version: '1.0.50',
    versionClient: '1.0.50',
    allowedRoot: true,
    get: vi.fn().mockResolvedValue({ status: 200, data: 'html' }),
    post: vi.fn().mockResolvedValue({ status: 201, data: 'ok' }),
    ...overrides,
  } as HttpType;
  return http;
}

const origin = 'https://upstream.example';

describe('ExtensionTransport', () => {
  it('prefixes relative URLs with the origin and the vsub fragment', async () => {
    const http = fakeHttp();
    const transport = new ExtensionTransport({
      loadHttp: async () => http,
      origin: `${origin}/`,
    });
    const res = await transport.get({
      url: '/danh-sach/',
      headers: { a: 'b' },
    });
    expect(res).toEqual({ status: 200, data: 'html' });
    expect(http.get).toHaveBeenCalledWith({
      url: `${origin}/danh-sach/#animevsub-vsub`,
      headers: { a: 'b' },
      signal: undefined,
    });
  });

  it('leaves absolute URLs untouched', async () => {
    const http = fakeHttp();
    const transport = new ExtensionTransport({
      loadHttp: async () => http,
      origin,
    });
    await transport.get({ url: 'https://other.example/x' });
    expect(http.get).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://other.example/x' }),
    );
  });

  it('posts form data and decodes an ArrayBuffer body', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({
        status: 200,
        data: new TextEncoder().encode('bytes').buffer,
      }),
    });
    const transport = new ExtensionTransport({
      loadHttp: async () => http,
      origin,
    });
    const res = await transport.post({ url: '/ajax/item', data: { n: 1 } });
    expect(res.data).toBe('bytes');
    expect(http.post).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${origin}/ajax/item#animevsub-vsub`,
        data: { n: 1 },
      }),
    );
  });

  it('throws ExtensionMissingError when Http.version is absent', async () => {
    const http = fakeHttp({ version: undefined as unknown as string });
    const transport = new ExtensionTransport({
      loadHttp: async () => http,
      origin,
    });
    await expect(transport.get({ url: '/' })).rejects.toBeInstanceOf(
      ExtensionMissingError,
    );
    await expect(transport.post({ url: '/' })).rejects.toBeInstanceOf(
      ExtensionMissingError,
    );
    expect(http.get).not.toHaveBeenCalled();
  });

  it('wraps a rejected extension call in TransportNetworkError', async () => {
    const http = fakeHttp({ get: vi.fn().mockRejectedValue(new Error('x')) });
    const transport = new ExtensionTransport({
      loadHttp: async () => http,
      origin,
    });
    await expect(transport.get({ url: '/' })).rejects.toBeInstanceOf(
      TransportNetworkError,
    );
  });
});
