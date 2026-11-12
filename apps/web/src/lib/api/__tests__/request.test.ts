import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet } from '../request.ts';

const respond = (status: number, json?: unknown) =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    json === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(json), { status }),
  );

describe('apiGet', () => {
  beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test/'));

  it('reads the endpoint with the session cookie and returns the body', async () => {
    const fetchMock = respond(200, { items: [1, 2] });
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await apiGet('/v1/things', signal)).toEqual({ items: [1, 2] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.test/v1/things');
    expect(init).toMatchObject({ credentials: 'include', signal });
  });

  it('throws an ApiError carrying the status on a non-200', async () => {
    vi.stubGlobal('fetch', respond(401));
    await expect(apiGet('/v1/things')).rejects.toMatchObject({
      constructor: ApiError,
      status: 401,
    });
  });

  it('throws without calling out when VITE_API_URL is unset', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchMock = respond(200, { items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiGet('/v1/things')).rejects.toThrow(
      'VITE_API_URL is not set',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
