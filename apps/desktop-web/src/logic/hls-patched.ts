import type {
  Fragment,
  HlsConfig,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderOnProgress,
  LoaderResponse
} from "hls.js"
import Hls from "hls.js"
import { decryptAvsPlaylist } from "src/logic/avs-playlist"

function getRequestParameters(
  context: LoaderContext,
  signal: AbortSignal
): RequestInit & { headers: Headers } {
  const initParams: RequestInit & { headers: Headers } = {
    method: "GET",
    mode: "cors",
    credentials: "same-origin",
    signal,
    headers: new self.Headers(Object.assign({}, context.headers))
  }

  if (context.rangeEnd) {
    initParams.headers.set(
      "Range",
      "bytes=" + context.rangeStart + "-" + String(context.rangeEnd - 1)
    )
  }

  return initParams
}

const BYTERANGE = /(\d+)-(\d+)\/(\d+)/

function getByteRangeLength(byteRangeHeader: string): number | undefined {
  const result = BYTERANGE.exec(byteRangeHeader)
  if (result) {
    return parseInt(result[2]) - parseInt(result[1]) + 1
  }
}

function getContentLength(headers: Headers): number | undefined {
  const contentRange = headers.get("Content-Range")
  if (contentRange) {
    const byteRangeLength = getByteRangeLength(contentRange)
    if (Number.isFinite(byteRangeLength)) {
      return byteRangeLength
    }
  }
  const contentLength = headers.get("Content-Length")
  if (contentLength) {
    return parseInt(contentLength)
  }
}

class FetchError extends Error {
  public code: number
  public details: any
  constructor(message: string, code: number, details: any) {
    super(message)
    this.code = code
    this.details = details
  }
}

export class HlsPatched extends Hls {
  constructor(
    userConfig: Partial<HlsConfig>,
    fetch: (request: Request) => Promise<Response>,
    onSlow?: () => void
  ) {
    super(userConfig)

    this.config.loader = class extends this.config.loader {
      load(
        this: any,
        context: LoaderContext,
        config: LoaderConfiguration,
        callbacks: LoaderCallbacks<LoaderContext>
      ): void {
        const stats = this.stats
        if (stats.loading.start) {
          throw new Error("Loader can only be used once.")
        }
        stats.loading.start = self.performance.now()

        const initParams = getRequestParameters(context, this.controller.signal)
        const onProgress: LoaderOnProgress<LoaderContext> | undefined =
          callbacks.onProgress
        const isArrayBuffer = context.responseType === "arraybuffer"
        const LENGTH = isArrayBuffer ? "byteLength" : "length"
        const { maxTimeToFirstByteMs, maxLoadTimeMs } = config.loadPolicy

        this.context = context
        this.config = config
        this.callbacks = callbacks
        // fetchSetup tags context.url in place for the extension. hls.js keys
        // its key cache on context.url and checks it again when the key
        // arrives, so hand the original back and keep the tagged one for the
        // request.
        const publicUrl = context.url
        this.request = this.fetchSetup(context, initParams)
        const requestUrl = context.url
        context.url = publicUrl
        self.clearTimeout(this.requestTimeout)
        config.timeout =
          maxTimeToFirstByteMs && Number.isFinite(maxTimeToFirstByteMs)
            ? maxTimeToFirstByteMs
            : maxLoadTimeMs
        this.requestTimeout = self.setTimeout(() => {
          this.abortInternal()
          callbacks.onTimeout(stats, context, this.response)
        }, config.timeout)

        const now = performance.now()
        fetch(new Request(requestUrl, initParams))
          .then(async (response: Response): Promise<string | ArrayBuffer> => {
            this.response = this.loader = response

            const first = Math.max(self.performance.now(), stats.loading.start)

            self.clearTimeout(this.requestTimeout)
            config.timeout = maxLoadTimeMs
            this.requestTimeout = self.setTimeout(
              () => {
                this.abortInternal()
                callbacks.onTimeout(stats, context, this.response)
              },
              maxLoadTimeMs - (first - stats.loading.start)
            )

            if (!response.ok) {
              const { status, statusText } = response
              if (import.meta.env.DEV) {
                const body = await response
                  .clone()
                  .text()
                  .catch(() => "<unreadable>")
                console.warn(
                  `[hls-patched] HTTP ${status} ${context.url.split("#")[0].slice(0, 90)}\n` +
                    `  cf-mitigated: ${response.headers.get("cf-mitigated") ?? "-"}\n` +
                    `  body: ${body.slice(0, 300)}`
                )
              }
              throw new FetchError(
                statusText || "fetch, bad network response",
                status,
                response
              )
            }
            stats.loading.first = first

            stats.total = getContentLength(response.headers) || stats.total

            if (onProgress && Number.isFinite(config.highWaterMark)) {
              // Streamed chunks of an AES-128 segment reach the decrypter at
              // arbitrary boundaries and come out misaligned ("TS packets
              // that do not start with 0x47"), so encrypted fragments are
              // read whole and handed over in a single progress call, which
              // is how a progressive loader delivers its data.
              const encrypted = !!(context as { frag?: Fragment }).frag
                ?.decryptdata?.key
              if (encrypted) {
                const buffer = await response.arrayBuffer()
                stats.loaded = buffer.byteLength
                onProgress(stats, context, buffer, response)
                return new ArrayBuffer(0)
              }
              return this.loadProgressively(
                response,
                stats,
                context,
                config.highWaterMark,
                onProgress
              )
            }

            let data: any

            // Read the body exactly once: a Response body can only be consumed
            // a single time, so the earlier chain of separate `if`s threw
            // "body stream already read" for key and segment requests
            // (arraybuffer) and surfaced as keyLoadError with HTTP code 0.
            if (isArrayBuffer) {
              data = response.arrayBuffer()
            } else if (context.responseType === "json") {
              data = response.json()
            } else {
              data = response
                .text()
                .then((text) =>
                  decryptAvsPlaylist(
                    text,
                    response.headers,
                    response.url || context.url
                  )
                )
            }

            return data
          })
          .then((responseData: string | ArrayBuffer) => {
            const dur = performance.now() - now
            if (import.meta.env.DEV)
              console.info(
                `[hls-patched] ${context.responseType} ${dur.toFixed(0)}ms ${context.url.slice(0, 48)}`
              )
            if (dur > 14_000) {
              onSlow?.()
            }

            const response = this.response
            if (!response) {
              throw new Error("loader destroyed")
            }
            self.clearTimeout(this.requestTimeout)
            stats.loading.end = Math.max(
              self.performance.now(),
              stats.loading.first
            )
            const total = (responseData as unknown as any)[LENGTH]
            if (total) {
              stats.loaded = stats.total = total
            }

            const loaderResponse: LoaderResponse = {
              url: response.url,
              data: responseData,
              code: response.status
            }

            // eslint-disable-next-line promise/always-return
            if (onProgress && !Number.isFinite(config.highWaterMark)) {
              onProgress(stats, context, responseData, response)
            }

            callbacks.onSuccess(loaderResponse, stats, context, response)
          })
          .catch((error) => {
            self.clearTimeout(this.requestTimeout)
            if (stats.aborted) {
              return
            }
            // CORS errors result in an undefined code. Set it to 0 here to align with XHR's behavior
            // when destroying, 'error' itself can be undefined
            const code: number = !error ? 0 : error.code || 0
            const text: string = !error ? null : error.message
            callbacks.onError(
              { code, text },
              context,
              error ? error.details : null,
              stats
            )
          })
      }
    }
  }
}
