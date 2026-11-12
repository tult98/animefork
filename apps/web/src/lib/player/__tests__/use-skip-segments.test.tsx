// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, jsonResponse } from '../../../test/auth-stub.ts';
import { useSkipSegments } from '../use-skip-segments.ts';

const SEGMENTS = [
  { kind: 'intro', startS: 10, endS: 100 },
  { kind: 'outro', startS: 1300, endS: 1400 },
];

function stubSkipTimes(answer: () => Response | Promise<Response>) {
  vi.stubEnv('VITE_API_URL', API);
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return answer();
  });
  return urls;
}

function render(slug: string, label: string) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSkipSegments(slug, label), { wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSkipSegments', () => {
  it('has no segments while pending, then the segments of the episode', async () => {
    const urls = stubSkipTimes(() => jsonResponse(200, { segments: SEGMENTS }));
    const { result } = render('show a1', 'Tập 66');
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toEqual(SEGMENTS));
    expect(urls).toEqual([`${API}/v1/skip-times/show%20a1/66`]);
  });

  it('does not ask for an episode without a number', async () => {
    const urls = stubSkipTimes(() => jsonResponse(200, { segments: SEGMENTS }));
    const { result } = render('show-a1', 'Tập 1_BD_Full');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual([]);
    expect(urls).toEqual([]);
  });

  it('has no segments when the request fails', async () => {
    const urls = stubSkipTimes(() => jsonResponse(500, { error: 'boom' }));
    const { result } = render('show-a1', 'Tập 2');
    await waitFor(() => expect(urls).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual([]);
  });

  it('has no segments without an API', async () => {
    const { result } = render('show-a1', 'Tập 2');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual([]);
  });
});
