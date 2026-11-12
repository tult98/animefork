import fetchMock from 'fetch-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../request.ts';

const THINGS = 'https://api.test/v1/things';

const lastCall = () => fetchMock.callHistory.lastCall()!;

describe('apiRequest', () => {
  beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test/'));

  it('reads the endpoint with the session cookie and returns the body', async () => {
    fetchMock.get(THINGS, { items: [1, 2] });
    const signal = new AbortController().signal;
    expect(await apiRequest('/v1/things', { signal })).toEqual({
      items: [1, 2],
    });
    const { url, options } = lastCall();
    expect(url).toBe(THINGS);
    expect(options).toMatchObject({
      method: 'get',
      credentials: 'include',
      signal,
    });
    expect(options.body).toBeUndefined();
  });

  it('sends a JSON body with the method and keepalive it is given', async () => {
    fetchMock.put(THINGS, { ok: true });
    await apiRequest('/v1/things', {
      method: 'PUT',
      body: { a: 1 },
      keepalive: true,
    });
    const { options } = lastCall();
    expect(options).toMatchObject({
      method: 'put',
      credentials: 'include',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(options.body))).toEqual({ a: 1 });
  });

  it('returns undefined for a response without a body', async () => {
    fetchMock.post(THINGS, 204);
    expect(await apiRequest('/v1/things', { method: 'POST' })).toBeUndefined();
  });

  it('throws an ApiError with the status, the API error code and Retry-After', async () => {
    fetchMock.get(THINGS, {
      status: 429,
      body: { error: 'rate_limited' },
      headers: { 'retry-after': '120' },
    });
    await expect(apiRequest('/v1/things')).rejects.toMatchObject({
      constructor: ApiError,
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: 120,
    });
  });

  it('leaves the code and the delay out when the answer has neither', async () => {
    fetchMock.get(THINGS, { status: 500, headers: { 'retry-after': 'soon' } });
    await expect(apiRequest('/v1/things')).rejects.toMatchObject({
      status: 500,
      code: undefined,
      retryAfterSeconds: undefined,
    });
  });

  it('throws without calling out when VITE_API_URL is unset', async () => {
    vi.stubEnv('VITE_API_URL', '');
    fetchMock.get(THINGS, { items: [] });
    await expect(apiRequest('/v1/things')).rejects.toThrow(
      'VITE_API_URL is not set',
    );
    expect(fetchMock.callHistory.called()).toBe(false);
  });
});
