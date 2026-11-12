import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../request.ts';

const respond = (status: number, json?: unknown, headers?: HeadersInit) =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    json === undefined
      ? new Response(null, { status, headers })
      : new Response(JSON.stringify(json), { status, headers }),
  );

const lastCall = (fetchMock: ReturnType<typeof respond>) =>
  fetchMock.mock.calls[0] as unknown as [string, RequestInit];

describe('apiRequest', () => {
  beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test/'));

  it('reads the endpoint with the session cookie and returns the body', async () => {
    const fetchMock = respond(200, { items: [1, 2] });
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await apiRequest('/v1/things', { signal })).toEqual({
      items: [1, 2],
    });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('https://api.test/v1/things');
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
      signal,
    });
    expect(init.body).toBeUndefined();
  });

  it('sends a JSON body with the method and keepalive it is given', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/v1/things', {
      method: 'PUT',
      body: { a: 1 },
      keepalive: true,
    });
    const [, init] = lastCall(fetchMock);
    expect(init).toMatchObject({
      method: 'PUT',
      credentials: 'include',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(init.body))).toEqual({ a: 1 });
  });

  it('returns undefined for a response without a body', async () => {
    vi.stubGlobal('fetch', respond(204));
    expect(await apiRequest('/v1/things', { method: 'POST' })).toBeUndefined();
  });

  it('throws an ApiError with the status, the API error code and Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      respond(429, { error: 'rate_limited' }, { 'retry-after': '120' }),
    );
    await expect(apiRequest('/v1/things')).rejects.toMatchObject({
      constructor: ApiError,
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: 120,
    });
  });

  it('leaves the code and the delay out when the answer has neither', async () => {
    vi.stubGlobal('fetch', respond(500, undefined, { 'retry-after': 'soon' }));
    await expect(apiRequest('/v1/things')).rejects.toMatchObject({
      status: 500,
      code: undefined,
      retryAfterSeconds: undefined,
    });
  });

  it('throws without calling out when VITE_API_URL is unset', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchMock = respond(200, { items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/v1/things')).rejects.toThrow(
      'VITE_API_URL is not set',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
