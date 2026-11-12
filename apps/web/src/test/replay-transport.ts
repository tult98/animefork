import { TransportNetworkError } from '../lib/transport/errors.ts';
import type {
  GetRequest,
  PostRequest,
  Transport,
  TransportResponse,
} from '../lib/transport/types.ts';

// Maps a request URL to the file a mock-data folder holds for it: `/` is index.html, `/a/b/` is a/b.html.
export function fixtureFileFor(url: string): string {
  const { pathname } = new URL(url, 'http://fixture.invalid');
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (clean === '') return 'index.html';
  return /\.[a-z0-9]+$/i.test(clean) ? clean : `${clean}.html`;
}

export interface ReplayOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ReplayTransport implements Transport {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor({
    baseUrl = '/fixtures/default',
    fetchImpl = (...args) => fetch(...args),
  }: ReplayOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  get(req: GetRequest): Promise<TransportResponse> {
    return this.serve(req);
  }

  // Replay has no state, so a POST is served by path like a GET and the body is ignored.
  post(req: PostRequest): Promise<TransportResponse> {
    return this.serve(req);
  }

  private async serve(req: GetRequest): Promise<TransportResponse> {
    const file = `${this.baseUrl}/${fixtureFileFor(req.url)}`;
    try {
      const res = await this.fetchImpl(file, {
        signal: req.signal,
      });
      return { status: res.status, data: await res.text() };
    } catch (cause) {
      if (req.signal?.aborted) throw cause;
      throw new TransportNetworkError(req.url, { cause });
    }
  }
}
