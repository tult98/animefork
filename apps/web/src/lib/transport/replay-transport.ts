import { fixtureFileFor } from './fixture-path.ts';
import { TransportNetworkError } from './errors.ts';
import type {
  GetRequest,
  PostRequest,
  Transport,
  TransportResponse,
} from './types.ts';

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
        // Vite's dev server answers any unknown path that accepts text/html with index.html and a 200.
        headers: { Accept: 'text/plain' },
        signal: req.signal,
      });
      return { status: res.status, data: await res.text() };
    } catch (cause) {
      if (req.signal?.aborted) throw cause;
      throw new TransportNetworkError(req.url, { cause });
    }
  }
}
