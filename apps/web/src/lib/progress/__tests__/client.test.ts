import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProgress, saveProgress } from '../client.ts';

const body = {
  slug: 'show',
  episodeId: '12',
  positionS: 10,
  durationS: 1400,
  titleName: 'Show',
  image: '',
  episodeLabel: 'Tập 1',
  seasonSlug: 'show',
};

const respond = (status: number, json?: unknown) =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
    json === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(json), { status }),
  );

describe('watch progress client', () => {
  beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test/'));

  const stored = {
    episodeId: '12',
    positionS: 10,
    durationS: 1400,
    completed: false,
  };

  it('PUTs the body with the session cookie and returns the stored row', async () => {
    const fetchMock = respond(200, stored);
    vi.stubGlobal('fetch', fetchMock);
    expect(await saveProgress(body, { keepalive: true })).toEqual({
      kind: 'saved',
      row: stored,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.test/v1/watch-progress');
    expect(init).toMatchObject({
      method: 'PUT',
      credentials: 'include',
      keepalive: true,
    });
    expect(JSON.parse(String(init.body))).toEqual(body);
  });

  it('tells a 401 apart from other failures', async () => {
    vi.stubGlobal('fetch', respond(401));
    expect(await saveProgress(body)).toEqual({ kind: 'unauthorized' });
    vi.stubGlobal('fetch', respond(500));
    expect(await saveProgress(body)).toEqual({ kind: 'failed' });
    vi.stubGlobal('fetch', async () =>
      Promise.reject(new TypeError('offline')),
    );
    expect(await saveProgress(body)).toEqual({ kind: 'failed' });
  });

  it('fails on a 200 whose body is not a stored row', async () => {
    vi.stubGlobal('fetch', respond(200, { episodeId: 12 }));
    expect(await saveProgress(body)).toEqual({ kind: 'failed' });
    vi.stubGlobal('fetch', respond(200));
    expect(await saveProgress(body)).toEqual({ kind: 'failed' });
    vi.stubGlobal('fetch', respond(204));
    expect(await saveProgress(body)).toEqual({ kind: 'failed' });
  });

  it('does not call out without VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchMock = respond(200, stored);
    vi.stubGlobal('fetch', fetchMock);
    expect(await saveProgress(body)).toEqual({ kind: 'failed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the rows of a slug', async () => {
    const items = [
      { episodeId: '12', positionS: 10, durationS: 1400, completed: false },
    ];
    const fetchMock = respond(200, { items });
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchProgress('a b')).toEqual(items);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.test/v1/watch-progress/a%20b',
    );
  });

  it('throws on a failed or malformed read', async () => {
    vi.stubGlobal('fetch', respond(401));
    await expect(fetchProgress('show')).rejects.toThrow();
    vi.stubGlobal('fetch', respond(200, { items: [{ episodeId: 1 }] }));
    await expect(fetchProgress('show')).rejects.toThrow();
  });
});
