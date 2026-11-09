// Serves the dev app on an allowlisted origin so the browser, not Node, talks
// to the CDN.
//
// Why: /player/ and /seg-key on stream.googleapiscdn.com are Cloudflare-gated
// (cf-mitigated: challenge), so any Node-side proxy is rejected. The browser
// passes that challenge, but the CDN also binds the playlist token to the
// domain that fetched the player page, and localhost is not allowed. Running
// the app on https://animevsub.eu.org makes the whole chain look like the real
// deployment, with no proxy and no token rewriting.
//
// Setup (once):
//   sudo sh -c 'echo "127.0.0.1 animevsub.eu.org" >> /etc/hosts'
//
// Run:
//   sudo node tools/new-dha-probe/local-domain.mjs          # needs :443
//   # then open https://animevsub.eu.org/ and accept the self-signed cert
//
// The dev server keeps running on 9000; this only terminates TLS on 443 and
// forwards, rewriting Host so Vite's host check still passes.
import https from "node:https"
import http from "node:http"
import net from "node:net"
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const host = flag("--host", "animevsub.eu.org")
const listenPort = Number(flag("--port", "443"))
const upstreamPort = Number(flag("--upstream", "9000"))
const certDir = path.join(here, "out", "cert")
const keyPath = path.join(certDir, "key.pem")
const certPath = path.join(certDir, "cert.pem")

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  fs.mkdirSync(certDir, { recursive: true })
  console.log(`generating self-signed cert for ${host}`)
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "365",
    "-keyout", keyPath, "-out", certPath,
    "-subj", `/CN=${host}`,
    "-addext", `subjectAltName=DNS:${host}`
  ])
}

const server = https.createServer(
  { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
  (req, res) => {
    const headers = { ...req.headers, host: `127.0.0.1:${upstreamPort}` }
    const up = http.request(
      { host: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers },
      (r) => {
        res.writeHead(r.statusCode || 502, r.headers)
        r.pipe(res)
      }
    )
    up.on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" })
      res.end(`dev server on :${upstreamPort} not reachable: ${e.message}`)
    })
    req.pipe(up)
  }
)

// websocket for HMR
server.on("upgrade", (req, socket, head) => {
  const up = net.connect(upstreamPort, "127.0.0.1", () => {
    const lines = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${k.toLowerCase() === "host" ? `127.0.0.1:${upstreamPort}` : v}`)
      .join("\r\n")
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines}\r\n\r\n`)
    if (head && head.length) up.write(head)
    up.pipe(socket)
    socket.pipe(up)
  })
  up.on("error", () => socket.destroy())
})

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`https://${host}${listenPort === 443 ? "" : ":" + listenPort}/  ->  http://127.0.0.1:${upstreamPort}`)
  console.log(`cert: ${certPath}`)
  if (listenPort < 1024) console.log("(port 443 needs sudo)")
})
