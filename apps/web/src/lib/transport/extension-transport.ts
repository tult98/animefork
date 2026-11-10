import type { HttpType } from 'client-ext-animevsub-helper';
import { ExtensionMissingError, TransportNetworkError } from './errors.ts';
import type {
  GetRequest,
  PostRequest,
  Transport,
  TransportResponse,
} from './types.ts';

export const DEFAULT_UPSTREAM_ORIGIN = 'https://animevietsub.best';

// The helper extension only treats this fragment as a request for the Vietsub variant of the page.
const VSUB_FRAGMENT = '#animevsub-vsub';

export interface ExtensionOptions {
  loadHttp: () => Promise<HttpType>;
  origin?: string;
}

export class ExtensionTransport implements Transport {
  private readonly loadHttp: () => Promise<HttpType>;
  private readonly origin: string;

  constructor({
    loadHttp,
    origin = DEFAULT_UPSTREAM_ORIGIN,
  }: ExtensionOptions) {
    this.loadHttp = loadHttp;
    this.origin = origin.replace(/\/+$/, '');
  }

  async get({ url, headers, signal }: GetRequest): Promise<TransportResponse> {
    const http = await this.http();
    const target = this.resolve(url);
    return this.run(target, async () =>
      toResponse(await http.get({ url: target, headers, signal })),
    );
  }

  async post({
    url,
    data,
    headers,
    signal,
  }: PostRequest): Promise<TransportResponse> {
    const http = await this.http();
    const target = this.resolve(url);
    return this.run(target, async () =>
      toResponse(await http.post({ url: target, data, headers, signal })),
    );
  }

  private async http(): Promise<HttpType> {
    const http = await this.loadHttp();
    if (!http.version) throw new ExtensionMissingError();
    return http;
  }

  private resolve(url: string): string {
    if (url.includes('://')) return url;
    return `${this.origin}${url.startsWith('/') ? '' : '/'}${url}${VSUB_FRAGMENT}`;
  }

  private async run(
    url: string,
    call: () => Promise<TransportResponse>,
  ): Promise<TransportResponse> {
    try {
      return await call();
    } catch (cause) {
      throw new TransportNetworkError(url, { cause });
    }
  }
}

function toResponse(res: { status: number; data: string | ArrayBuffer }) {
  return {
    status: res.status,
    data:
      typeof res.data === 'string'
        ? res.data
        : new TextDecoder().decode(res.data),
  };
}

export const loadExtensionHttp = async (): Promise<HttpType> =>
  (await import('client-ext-animevsub-helper')).Http;
