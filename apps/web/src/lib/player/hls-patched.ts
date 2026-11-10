import Hls from 'hls.js';
import type {
  Fragment,
  HlsConfig,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderOnProgress,
  LoaderResponse,
  LoaderStats,
} from 'hls.js';
import { decryptAvsPlaylist } from './avs-playlist.ts';

type FetchFn = (request: Request) => Promise<Response>;

interface LoaderInternals {
  stats: LoaderStats;
  controller: AbortController;
  context: LoaderContext | null;
  config: LoaderConfiguration | null;
  callbacks: LoaderCallbacks<LoaderContext> | null;
  request: Request | null;
  response: Response | null;
  loader: Response | null;
  requestTimeout?: number;
  fetchSetup(context: LoaderContext, init: RequestInit): Request;
  abortInternal(): void;
  loadProgressively(
    response: Response,
    stats: LoaderStats,
    context: LoaderContext,
    highWaterMark: number,
    onProgress: LoaderOnProgress<LoaderContext>,
  ): Promise<ArrayBuffer>;
}

class FetchError extends Error {
  code: number;
  details: Response;

  constructor(message: string, code: number, details: Response) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function requestParameters(
  context: LoaderContext,
  signal: AbortSignal,
): RequestInit & { headers: Headers } {
  const init = {
    method: 'GET',
    mode: 'cors' as const,
    credentials: 'same-origin' as const,
    signal,
    headers: new self.Headers(Object.assign({}, context.headers)),
  };
  if (context.rangeEnd) {
    init.headers.set(
      'Range',
      `bytes=${context.rangeStart}-${String(context.rangeEnd - 1)}`,
    );
  }
  return init;
}

const BYTE_RANGE = /(\d+)-(\d+)\/(\d+)/;

function contentLength(headers: Headers): number | undefined {
  const range = BYTE_RANGE.exec(headers.get('Content-Range') ?? '');
  if (range) return parseInt(range[2]!) - parseInt(range[1]!) + 1;
  const length = headers.get('Content-Length');
  return length ? parseInt(length) : undefined;
}

// hls.js 1.5.9's fetch loader with one change: a text response goes through decryptAvsPlaylist,
// because the iframe server answers with a cipher playlist that hls.js cannot parse.
export class HlsPatched extends Hls {
  constructor(userConfig: Partial<HlsConfig>, fetchFn: FetchFn = fetch) {
    super(userConfig);

    this.config.loader = class extends this.config.loader {
      override load(
        this: LoaderInternals,
        context: LoaderContext,
        config: LoaderConfiguration,
        callbacks: LoaderCallbacks<LoaderContext>,
      ): void {
        const stats = this.stats;
        if (stats.loading.start) {
          throw new Error('Loader can only be used once.');
        }
        stats.loading.start = self.performance.now();

        const init = requestParameters(context, this.controller.signal);
        const onProgress = callbacks.onProgress;
        const isArrayBuffer = context.responseType === 'arraybuffer';
        const { maxTimeToFirstByteMs, maxLoadTimeMs } = config.loadPolicy;

        this.context = context;
        this.config = config;
        this.callbacks = callbacks;
        // fetchSetup tags context.url in place for the extension. hls.js keys its key cache on
        // context.url and checks it again when the key arrives, so the original goes back on the
        // context and the tagged one is kept for the request.
        const publicUrl = context.url;
        this.request = this.fetchSetup(context, init);
        const requestUrl = context.url;
        context.url = publicUrl;
        self.clearTimeout(this.requestTimeout);
        config.timeout =
          maxTimeToFirstByteMs && Number.isFinite(maxTimeToFirstByteMs)
            ? maxTimeToFirstByteMs
            : maxLoadTimeMs;
        this.requestTimeout = self.setTimeout(() => {
          this.abortInternal();
          callbacks.onTimeout(stats, context, this.response);
        }, config.timeout);

        fetchFn(new Request(requestUrl, init))
          .then(async (response): Promise<string | ArrayBuffer | object> => {
            this.response = this.loader = response;
            const first = Math.max(self.performance.now(), stats.loading.start);

            self.clearTimeout(this.requestTimeout);
            config.timeout = maxLoadTimeMs;
            this.requestTimeout = self.setTimeout(
              () => {
                this.abortInternal();
                callbacks.onTimeout(stats, context, this.response);
              },
              maxLoadTimeMs - (first - stats.loading.start),
            );

            if (!response.ok) {
              throw new FetchError(
                response.statusText || 'fetch, bad network response',
                response.status,
                response,
              );
            }
            stats.loading.first = first;
            stats.total = contentLength(response.headers) || stats.total;

            if (onProgress && Number.isFinite(config.highWaterMark)) {
              // Streamed chunks of an AES-128 segment reach the decrypter at arbitrary boundaries
              // and come out misaligned, so an encrypted fragment is read whole and handed over in
              // one progress call, the way a progressive loader delivers its data.
              const encrypted = !!(context as { frag?: Fragment }).frag
                ?.decryptdata?.key;
              if (encrypted) {
                const buffer = await response.arrayBuffer();
                stats.loaded = buffer.byteLength;
                onProgress(stats, context, buffer, response);
                return new ArrayBuffer(0);
              }
              return this.loadProgressively(
                response,
                stats,
                context,
                config.highWaterMark as number,
                onProgress,
              );
            }

            // A body can be read once, so the response type picks exactly one reader.
            if (isArrayBuffer) return response.arrayBuffer();
            if (context.responseType === 'json') {
              return (await response.json()) as object;
            }
            return decryptAvsPlaylist(
              await response.text(),
              response.headers,
              response.url || context.url,
            );
          })
          .then((data) => {
            const response = this.response;
            if (!response) throw new Error('loader destroyed');
            self.clearTimeout(this.requestTimeout);
            stats.loading.end = Math.max(
              self.performance.now(),
              stats.loading.first,
            );
            const total =
              typeof data === 'string'
                ? data.length
                : data instanceof ArrayBuffer
                  ? data.byteLength
                  : 0;
            if (total) stats.loaded = stats.total = total;

            const loaderResponse: LoaderResponse = {
              url: response.url,
              data,
              code: response.status,
            };
            if (onProgress && !Number.isFinite(config.highWaterMark)) {
              onProgress(
                stats,
                context,
                data as string | ArrayBuffer,
                response,
              );
            }
            callbacks.onSuccess(loaderResponse, stats, context, response);
          })
          .catch((error: unknown) => {
            self.clearTimeout(this.requestTimeout);
            if (stats.aborted) return;
            const failure = error as Partial<FetchError> | undefined;
            callbacks.onError(
              { code: failure?.code || 0, text: failure?.message ?? '' },
              context,
              failure?.details ?? null,
              stats,
            );
          });
      }
    };
  }
}
