// Maps the new-dha protocol without touching the real site: serves a fake
// player page, then records what the wasm asks for next.
//
//   node tools/new-dha-probe/fake-player.mjs [port]
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../..")
const pkgDir = path.join(repoRoot, "apps/desktop-web/src/logic/new-dha/pkg")
const port = Number(process.argv[2] || 8899)

const seen = []
const server = http.createServer(async (req, res) => {
  const body = []
  for await (const c of req) body.push(c)
  const b = Buffer.concat(body).toString()
  seen.push({ method: req.method, url: req.url, headers: req.headers, body: b.slice(0, 2000) })
  console.log(`\n>>> ${req.method} ${req.url}`)
  for (const [k, v] of Object.entries(req.headers)) console.log(`    ${k}: ${v}`)
  if (b) console.log(`    body: ${b.slice(0, 300)}`)

  if (req.url.startsWith("/player/") && !req.url.includes(".m3u8")) {
    // progressively closer to the real page: id / avsToken / harden flags
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="app" data-id="4242"></div>
<script>
  var id = "4242";
  var avsToken = "FAKE_TOKEN_0123456789abcdef";
  var token_avsCryptoHarden = true;
  var _avsCryptoHardenShadow = true;
  var bad_i_param = 0;
</script>
</body></html>`)
    return
  }
  if (req.url.includes(".m3u8")) {
    res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" })
    res.end("#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:4.0,\n/seg/AAA/1.ts?x=1\n")
    return
  }
  res.writeHead(200, { "content-type": "text/plain" })
  res.end("ok")
})

server.listen(port, "127.0.0.1", async () => {
  const link = `http://127.0.0.1:${port}/player/fakehash`
  console.log("fake player on", link)

  const realFetch = globalThis.fetch
  class Window {}
  Object.defineProperty(Window, Symbol.hasInstance, { value: (x) => x === globalThis })
  globalThis.Window = Window
  globalThis.window = globalThis
  globalThis.self = globalThis
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url
    console.log(`    [wasm fetch] ${init && init.method || (input && input.method) || "GET"} ${url}`)
    if (init && init.headers) console.log("    [headers]", init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers)
    if (input && typeof input !== "string" && input.referrer) console.log("    [referrer]", input.referrer)
    return realFetch(input, init)
  }

  const { initModule, get_m3u8_content, decrypt_segment, imports } = await import(path.join(pkgDir, "glue.mjs"))

  // trace the interesting boundary calls
  const g = imports["./new_dha_bg.js"]
  for (const name of Object.keys(g)) {
    if (!/set_022bee52d0b05b19|new_with_str_and_init|set_method_c9f1f985f6b6c427|searchParams|pathname|origin_/.test(name)) continue
    const orig = g[name]
    g[name] = (...a) => {
      const r = orig(...a)
      console.log(`    [${name.split("_").slice(0, 3).join("_")}] args=`, a.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).slice(1), "->", typeof r === "object" ? JSON.stringify(r) : r)
      return r
    }
  }

  initModule(new WebAssembly.Module(fs.readFileSync(path.join(pkgDir, "new_dha_bg.wasm"))))
  try {
    const out = await get_m3u8_content(link)
    console.log("\n[RESULT]", typeof out, String(out).slice(0, 400))
  } catch (e) {
    console.log("\n[THREW]", e && (e.message || e))
  }
  try {
    const d = await decrypt_segment(`http://127.0.0.1:${port}/seg/AAA/1.ts?x=1`)
    console.log("[decrypt_segment]", d)
  } catch (e) {
    console.log("[segment THREW]", e && (e.message || e))
  }
  fs.writeFileSync(path.join(here, "out", "fake-requests.json"), JSON.stringify(seen, null, 2))
  server.close()
})
