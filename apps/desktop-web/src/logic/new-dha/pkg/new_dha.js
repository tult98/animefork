// Drop-in replacement for the private `anime-vsub/new-dha` wasm package.
//
// pkg/new_dha_bg.wasm is the build that ships in the public web app and
// pkg/glue.mjs is the matching wasm-bindgen shim extracted from that same
// bundle. This file keeps the original module contract:
//
//   init(wasmUrl?)            -> Promise<void>
//   get_m3u8_content(link)    -> Promise<string>   (plain m3u8 text)
//   decrypt_segment(url)      -> Promise<string>   (url to fetch instead)
//
// The wasm keeps the decoded playlist key in its own global state, so
// get_m3u8_content() must resolve at least once per stream before
// decrypt_segment() is called. hls.js already does that: the master playlist
// is loaded before any segment request.
import { initModule, get_m3u8_content, decrypt_segment } from "./glue.mjs"

let ready

// Dev escape hatch: when the app is served from a domain the CDN does not
// whitelist (localhost), route media traffic through tools/new-dha-probe/dev-proxy.mjs
// which re-issues it with an allowed Referer/Origin. Enable from the console:
//   window.__NEW_DHA_PROXY__ = "http://127.0.0.1:8787/"
function installProxy(base) {
  if (!base || globalThis.__newDhaProxyInstalled) return
  globalThis.__newDhaProxyInstalled = true
  // The player page itself is fetched by the browser, which Cloudflare allows.
  // Node cannot pass that challenge, so leave player-page requests alone and
  // only reroute the CDN media routes that check the caller's domain.
  const skip = globalThis.__NEW_DHA_PROXY_SKIP__ ?? /\/player\//
  const orig = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (input, init = {}) => {
    const isReq = typeof Request === "function" && input instanceof Request
    const url = isReq ? input.url : String(input)
    if (!/^https?:/i.test(url) || url.startsWith(base)) return orig(input, init)
    if (skip.test(url)) return orig(input, init)
    const target = base + "?u=" + encodeURIComponent(url)
    return isReq
      ? orig(new Request(target, { method: input.method, headers: input.headers, signal: input.signal }))
      : orig(target, init)
  }
}

function toModule(input) {
  if (input instanceof WebAssembly.Module) return Promise.resolve(input)
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    return WebAssembly.compile(input)
  }
  // URL / Request / Response / string
  if (typeof Response === "function" && input instanceof Response) {
    return WebAssembly.compileStreaming
      ? WebAssembly.compileStreaming(input)
      : input.arrayBuffer().then(WebAssembly.compile)
  }
  return WebAssembly.compileStreaming
    ? WebAssembly.compileStreaming(fetch(input))
    : fetch(input)
        .then((r) => r.arrayBuffer())
        .then(WebAssembly.compile)
}

export default function init(wasmUrl) {
  installProxy(globalThis.__NEW_DHA_PROXY__)
  if (!ready) {
    ready = Promise.resolve(toModule(wasmUrl)).then((mod) => {
      initModule(mod)
    })
  }
  return ready
}

export { get_m3u8_content, decrypt_segment }
