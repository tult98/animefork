import { DEFAULT_UPSTREAM_ORIGIN } from '../lib/transport/extension-transport.ts';
import { TransportNetworkError } from '../lib/transport/errors.ts';
import type {
  GetRequest,
  PostRequest,
  Transport,
  TransportResponse,
} from '../lib/transport/types.ts';

// The URL a test mocks for an upstream path, so a route reads fetchMock.get(upstream('/phim/x/'), html).
export const upstream = (path: string) =>
  new URL(path, DEFAULT_UPSTREAM_ORIGIN).href;

// Sends every upstream call through global fetch at its real URL, so fetch-mock decides the answer.
export class FetchTransport implements Transport {
  get(req: GetRequest): Promise<TransportResponse> {
    return this.send(req, { method: 'GET' });
  }

  post(req: PostRequest): Promise<TransportResponse> {
    const body = req.data
      ? new URLSearchParams(
          Object.entries(req.data).map(([key, value]) => [key, String(value)]),
        )
      : undefined;
    return this.send(req, { method: 'POST', body });
  }

  private async send(
    { url, headers, signal }: GetRequest,
    init: RequestInit,
  ): Promise<TransportResponse> {
    const target = upstream(url);
    try {
      const res = await fetch(target, { ...init, headers, signal });
      return { status: res.status, data: await res.text() };
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw new TransportNetworkError(target, { cause });
    }
  }
}
