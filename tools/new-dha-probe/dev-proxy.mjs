// Local egress proxy for the iframe player.
//
// The CDN mints the playlist token when the player page is fetched and binds it
// to the requesting domain, so a localhost app gets {"status":"fail",
// "message":"domain not allowed"}. This proxy re-issues those requests with a
// Referer/Origin the CDN accepts, and keeps CORS happy for the browser.
//
//   node tools/new-dha-probe/dev-proxy.mjs --referer https://animevietsub.best/ [--port 8787]
//
// Then in the app, before playing (DevTools console):
//   window.__NEW_DHA_PROXY__ = "http://127.0.0.1:8787/"
//
// Every request is logged to stdout and to out/proxy.log.
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const referer = flag("--referer", "https://animevietsub.best/")
const port = Number(flag("--port", "8787"))
const outDir = path.join(here, "out")
fs.mkdirSync(outDir, { recursive: true })
const logPath = path.join(outDir, "proxy.log")
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

const origin = new URL(referer).origin
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-expose-headers": "*"
}

const log = (line) => {
  console.log(line)
  fs.appendFileSync(logPath, line + "\n")
}

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS)
      return res.end()
    }
    const u = new URL(req.url, "http://127.0.0.1")
    const target = u.searchParams.get("u")
    if (!target) {
      res.writeHead(400, { ...CORS, "content-type": "text/plain" })
      return res.end("missing ?u=")
    }

    const headers = {
      "user-agent": UA,
      accept: "*/*",
      "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
      referer,
      origin
    }
    const range = req.headers.range
    if (range) headers.range = range

    try {
      const upstream = await fetch(target, { headers, redirect: "follow" })
      const buf = Buffer.from(await upstream.arrayBuffer())
      const passHeaders = { ...CORS }
      for (const h of [
        "content-type",
        "content-range",
        "accept-ranges",
        "content-length",
        "x-envelope",
        "x-edge-tag",
        "x-cache-node",
        "x-request-trace",
        "x-proxy-digest"
      ]) {
        const v = upstream.headers.get(h)
        if (v) passHeaders[h] = v
      }
      log(
        `${new Date().toISOString()} ${upstream.status} ${buf.length}B ${u.host || ""}${new URL(target).pathname} tag=${upstream.headers.get("x-edge-tag") || "-"}`
      )
      if (buf.length && buf.length < 4000 && (passHeaders["content-type"] || "").includes("json")) {
        log(`   body: ${buf.toString().slice(0, 300)}`)
      }
      res.writeHead(upstream.status, passHeaders)
      res.end(buf)
    } catch (e) {
      log(`${new Date().toISOString()} ERR ${target} ${e.message}`)
      res.writeHead(502, { ...CORS, "content-type": "text/plain" })
      res.end(String(e))
    }
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`dev-proxy on http://127.0.0.1:${port}/`)
    console.log(`spoofing Referer: ${referer}`)
    console.log("in the app console: window.__NEW_DHA_PROXY__ = \"http://127.0.0.1:" + port + "/\"")
  })
