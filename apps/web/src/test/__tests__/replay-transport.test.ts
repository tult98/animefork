import { describe, expect, it } from 'vitest';
import { TransportNetworkError } from '../../lib/transport/errors.ts';
import { ReplayTransport, fixtureFileFor } from '../replay-transport.ts';

const files: Record<string, string> = {
  '/fixtures/default/index.html': '<p>home</p>',
  '/fixtures/invalid-title/index.html': '<p>not-a-number</p>',
};

const memoryFetch: typeof fetch = async (input) => {
  const body = files[String(input)];
  return body === undefined
    ? new Response('missing', { status: 404 })
    : new Response(body, { status: 200 });
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
  it('serves a page by URL path', async () => {
    const res = await new ReplayTransport({ fetchImpl: memoryFetch }).get({
      url: '/',
    });
    expect(res.status).toBe(200);
    expect(res.data).toContain('home');
  });

  it('serves a POST by path and ignores the body', async () => {
    const res = await new ReplayTransport({ fetchImpl: memoryFetch }).post({
      url: '/',
      data: { a: 1 },
    });
    expect(res.status).toBe(200);
  });

  it('passes a missing fixture through as status 404', async () => {
    const res = await new ReplayTransport({ fetchImpl: memoryFetch }).get({
      url: '/nope/',
    });
    expect(res.status).toBe(404);
  });

  it('reads from the configured fixture set', async () => {
    const res = await new ReplayTransport({
      baseUrl: '/fixtures/invalid-title/',
      fetchImpl: memoryFetch,
    }).get({ url: '/' });
    expect(res.data).toContain('not-a-number');
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
