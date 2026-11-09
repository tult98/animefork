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
  if (!ready) {
    ready = Promise.resolve(toModule(wasmUrl)).then((mod) => {
      initModule(mod)
    })
  }
  return ready
}

export { get_m3u8_content, decrypt_segment }
