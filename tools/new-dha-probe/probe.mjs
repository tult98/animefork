// Runs the real new-dha wasm locally and logs exactly what it requests.
//
//   node tools/new-dha-probe/probe.mjs "https://stream.googleapiscdn.com/player/<hash>"
//
// Optional:
//   --out <dir>          where to write the playlist + request dumps (default ./out)
//   --cookie "<c>"       Cookie header, e.g. copy cf_clearance from DevTools
//   --ua "<ua>"          User-Agent (default: desktop Chrome)
//   --header "k: v"      extra request header, repeatable
//
// The player page sits behind a Cloudflare managed challenge for datacenter
// IPs. A normal browser IP usually passes; if it does not, pass --cookie with
// the cf_clearance value and the matching --ua (both from the same browser).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../..")
const pkgDir = path.join(repoRoot, "apps/desktop-web/src/logic/new-dha/pkg")

const argv = process.argv.slice(2)
const playerUrl = argv.find((a) => !a.startsWith("--") && a.startsWith("http"))
if (!playerUrl) {
  console.error('usage: node tools/new-dha-probe/probe.mjs "https://stream.googleapiscdn.com/player/<hash>"')
  process.exit(1)
}
const flag = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const extraHeaders = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--header" && argv[i + 1]) {
    const [k, ...v] = argv[i + 1].split(":")
    extraHeaders.push([k.trim(), v.join(":").trim()])
  }
}
const outDir = path.resolve(process.cwd(), flag("--out", "out"))
fs.mkdirSync(outDir, { recursive: true })

const UA =
  flag("--ua", "") ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
const cookie = flag("--cookie", "")

const realFetch = globalThis.fetch
const baseHeaders = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
  ...(cookie ? { cookie } : {})
}
for (const [k, v] of extraHeaders) baseHeaders[k.toLowerCase()] = v

// web_sys::window() must resolve, and `x instanceof Window` must be true
class Window {}
Object.defineProperty(Window, Symbol.hasInstance, { value: (x) => x === globalThis })
globalThis.Window = Window
globalThis.window = globalThis
globalThis.self = globalThis

const log = []
globalThis.fetch = async (input, init = {}) => {
  const isRequest = typeof Request === "function" && input instanceof Request
  const url = isRequest ? input.url : String(input)
  const method = (init && init.method) || (isRequest ? input.method : "GET")
  const headers = { ...baseHeaders }
  const given = (init && init.headers) || (isRequest ? input.headers : null)
  if (given) {
    const h = given instanceof Headers ? Object.fromEntries(given) : given
    for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v
  }
  const entry = { method, url, headers: { ...headers } }
  if (cookie) entry.headers.cookie = "<redacted>"
  log.push(entry)

  const res = await realFetch(url, { ...init, method, headers })
  const body = await res.clone().text()
  entry.status = res.status
  entry.bytes = body.length
  entry.preview = body.slice(0, 400)
  console.log(`\n[fetch] ${method} ${url}`)
  console.log(`        -> HTTP ${res.status}, ${body.length} bytes`)
  const name = `req-${String(log.length).padStart(2, "0")}.txt`
  fs.writeFileSync(path.join(outDir, name), `# ${method} ${url}\n# status ${res.status}\n\n${body}`)
  entry.saved = name
  if (res.status === 403 && /Just a moment|_cf_chl_opt/.test(body)) {
    console.log('        !! Cloudflare challenge. Re-run with --cookie "cf_clearance=..." and the --ua of that browser.')
  }
  return res
}

const { initModule, get_m3u8_content, decrypt_segment } = await import(
  path.join(pkgDir, "glue.mjs")
)
const wasmPath = path.join(pkgDir, "new_dha_bg.wasm")
initModule(new WebAssembly.Module(fs.readFileSync(wasmPath)))
console.log(`wasm loaded from ${path.relative(repoRoot, wasmPath)}`)

let m3u8
try {
  m3u8 = await get_m3u8_content(playerUrl)
} catch (e) {
  console.error("\n[get_m3u8_content] threw:", e && (e.message || e))
  fs.writeFileSync(path.join(outDir, "requests.json"), JSON.stringify(log, null, 2))
  process.exit(2)
}

console.log(`\n[get_m3u8_content] ${typeof m3u8}, length ${m3u8 && m3u8.length}`)
if (typeof m3u8 === "string") {
  fs.writeFileSync(path.join(outDir, "playlist.m3u8"), m3u8)
  console.log("---- first 900 chars ----")
  console.log(m3u8.slice(0, 900))

  const lines = m3u8.split(/\r?\n/)
  const tags = lines.filter((l) => l.startsWith("#EXT"))
  const segs = [...new Set(lines.filter((l) => l && !l.startsWith("#")))]
  console.log(`\n[playlist] ${tags.length} tags, ${segs.length} unique segment lines`)
  for (const t of tags.slice(0, 8)) console.log(`   ${t}`)

  const mapping = []
  for (const s of segs.slice(0, 4)) {
    const abs = s.startsWith("http") ? s : new URL(s, playerUrl).href
    let out
    try {
      out = await decrypt_segment(abs)
    } catch (e) {
      out = `THREW: ${e && (e.message || e)}`
    }
    mapping.push({ in: abs, out })
    console.log(`\n[decrypt_segment]\n   in : ${abs}\n   out: ${out}`)
  }
  fs.writeFileSync(path.join(outDir, "segments.json"), JSON.stringify({ segs, mapping }, null, 2))
}

fs.writeFileSync(path.join(outDir, "requests.json"), JSON.stringify(log, null, 2))
console.log(`\nsaved -> ${outDir}`)
