// @vitest-environment node
import { webcrypto } from "node:crypto"

import { afterEach, describe, expect, test, vi } from "vitest"

import {
  AvsCipherError,
  decryptAvsPlaylist,
  maskPlan,
  shufflePlan
} from "./avs-playlist"

const subtle = webcrypto.subtle
const enc = new TextEncoder()
const b64u = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url")

const SK = "a1b2c3d4" + "e".repeat(35)
const CN = b64u(Uint8Array.from({ length: 16 }, (_, i) => i * 7 + 1))
const TS = "1700000000"
const UID = "user-0001"
const BASE = "https://stream.example/"

const FILE_ID = "0123456789abcdef01234567"
const REAL_SEGMENT = "https://cdn.example/media/seg000.png?sig=abc"
const JTI = Array.from(
  { length: 64 },
  (_, i) => `x${(i % 10).toString()}`
).join("")
const TOKEN = `h.${Buffer.from(JSON.stringify({ jti: JTI })).toString("base64url")}.s`
const SESSION_KEY = [...JTI].filter((_, i) => i % 2 === 1).join("")

async function placeholderUrl(index: number, corrupt = false): Promise<string> {
  const hmac = await subtle.importKey(
    "raw",
    enc.encode(SESSION_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const material = await subtle.sign(
    "HMAC",
    hmac,
    enc.encode(`url-cipher|${FILE_ID}`)
  )
  const key = await subtle.importKey("raw", material, "AES-CTR", false, [
    "encrypt"
  ])
  const counter = new Uint8Array(16)
  new DataView(counter.buffer).setUint32(12, index)
  const cipher = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-CTR", counter, length: 64 },
      key,
      enc.encode(REAL_SEGMENT)
    )
  )
  const e = corrupt ? b64u(cipher.map((byte) => byte ^ 0xff)) : b64u(cipher)
  return `https://cdn.example/hls/${FILE_ID}.ts?e=${e}&i=${index}&token=${TOKEN}`
}

async function encryptPlaylist(plain: string): Promise<string> {
  const { order, masks } = maskPlan(enc.encode(plain).length, SK, TS)
  const bytes = enc.encode(plain)
  const masked = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) masked[i] = bytes[order[i]] ^ masks[i]

  const iv = Buffer.from(CN, "base64url")
  const hmac = await subtle.importKey(
    "raw",
    iv,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const material = await subtle.sign(
    "HMAC",
    hmac,
    enc.encode(`${UID}:${TS}:${SK}:0`)
  )
  const key = await subtle.importKey("raw", material, "AES-GCM", false, [
    "encrypt"
  ])
  const sealed = b64u(
    new Uint8Array(
      await subtle.encrypt(
        { name: "AES-GCM", iv: iv.subarray(0, 12) },
        key,
        masked
      )
    )
  ).split("")
  for (const [a, b] of shufflePlan(sealed.length, SK))
    [sealed[a], sealed[b]] = [sealed[b], sealed[a]]
  return sealed.join("")
}

function envelopeHeader(): string {
  const json = enc.encode(JSON.stringify({ cn: CN, sk: SK, ts: TS, uid: UID }))
  return b64u(
    Uint8Array.from([
      85,
      83,
      68,
      75,
      1,
      json.length >> 8,
      json.length & 255,
      ...json,
      0,
      0,
      0,
      0
    ])
  )
}

async function cipherPlaylist(corruptUrls = false) {
  const real = [
    '#EXT-X-KEY:METHOD=AES-128,URI="https://stream.example/seg-key/k"',
    "#EXTINF:10.01,",
    "#EXT-X-BYTERANGE:100@128",
    await placeholderUrl(0, corruptUrls),
    "#EXTINF:8.008,",
    "#EXT-X-BYTERANGE:200@128",
    await placeholderUrl(1, corruptUrls),
    "#EXT-X-ENDLIST"
  ].join("\n")

  const sealed = await encryptPlaylist(real)
  const third = Math.ceil(sealed.length / 3)
  const chunks = [0, 1, 2].map((n) => sealed.slice(n * third, (n + 1) * third))
  const text = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:11",
    "#EXTINF:10,",
    ...chunks.map(
      (chunk, n) =>
        `/chunks/h/original/id/seg00${n}.html?si=${n}&token=T&_t=${chunk}${n === 0 ? "&_c=3" : ""}`
    ),
    "#EXT-X-ENDLIST"
  ].join("\n")
  return { text, real }
}

describe("decryptAvsPlaylist", () => {
  test("rebuilds the real playlist and resolves placeholder urls", async () => {
    const { text } = await cipherPlaylist()

    const out = await decryptAvsPlaylist(
      text,
      new Headers({ "X-Envelope": envelopeHeader() }),
      BASE
    )

    expect(out.split("\n")).toEqual([
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:11",
      '#EXT-X-KEY:METHOD=AES-128,URI="https://stream.example/seg-key/k"',
      "#EXTINF:10.01,",
      "#EXT-X-BYTERANGE:100@128",
      REAL_SEGMENT,
      "#EXTINF:8.008,",
      "#EXT-X-BYTERANGE:200@128",
      REAL_SEGMENT,
      "#EXT-X-ENDLIST"
    ])
  })

  test("reads the key material from the split headers", async () => {
    const { text } = await cipherPlaylist()

    const out = await decryptAvsPlaylist(
      text,
      new Headers({
        "X-Edge-Tag": CN,
        "X-Cache-Node": SK,
        "X-Request-Trace": TS,
        "X-Proxy-Digest": encodeURIComponent(UID)
      }),
      BASE
    )

    expect(out).toContain(REAL_SEGMENT)
  })

  test("leaves a plain playlist untouched", async () => {
    const plain =
      "#EXTM3U\n#EXTINF:10,\nhttps://cdn.example/a.ts\n#EXT-X-ENDLIST"

    expect(
      await decryptAvsPlaylist(
        plain,
        new Headers({ "X-Envelope": envelopeHeader() }),
        BASE
      )
    ).toBe(plain)
  })

  test("fails with an envelope error when a cipher playlist has no envelope", async () => {
    const { text } = await cipherPlaylist()

    await expect(
      decryptAvsPlaylist(text, new Headers(), BASE)
    ).rejects.toMatchObject({ name: "AvsCipherError", step: "envelope" })
  })

  test("fails with an envelope error on a garbage X-Envelope", async () => {
    const { text } = await cipherPlaylist()
    const error = await decryptAvsPlaylist(
      text,
      new Headers({ "X-Envelope": "garbage" }),
      BASE
    ).catch((e) => e)

    expect(error).toBeInstanceOf(AvsCipherError)
    expect(error.step).toBe("envelope")
  })

  test("rejects a tampered ciphertext", async () => {
    const { text } = await cipherPlaylist()
    const tampered = text.replace(/_t=./, (m) =>
      m === "_t=A" ? "_t=B" : "_t=A"
    )

    await expect(
      decryptAvsPlaylist(
        tampered,
        new Headers({ "X-Envelope": envelopeHeader() }),
        BASE
      )
    ).rejects.toMatchObject({
      name: "AvsCipherError",
      step: "playlist-decrypt"
    })
  })

  test("fails with a playlist-decrypt error when a cipher playlist has no _t values", async () => {
    const { text } = await cipherPlaylist()
    const stripped = text.replace(/&_t=[^&\s]+/g, "")
    expect(stripped).not.toContain("_t=")

    const error = await decryptAvsPlaylist(
      stripped,
      new Headers({ "X-Envelope": envelopeHeader() }),
      BASE
    ).catch((e) => e)

    expect(error).toBeInstanceOf(AvsCipherError)
    expect(error.step).toBe("playlist-decrypt")
    expect(error.message).toContain("no _t= values")
  })

  test("fails with a url-cipher error on a corrupted placeholder url", async () => {
    const { text } = await cipherPlaylist(true)
    const error = await decryptAvsPlaylist(
      text,
      new Headers({ "X-Envelope": envelopeHeader() }),
      BASE
    ).catch((e) => e)

    expect(error).toBeInstanceOf(AvsCipherError)
    expect(error.step).toBe("url-cipher")
  })
})

describe("noteLoaderVersion", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  test("warns once per version whose major.minor is unsupported", async () => {
    vi.resetModules()
    const { noteLoaderVersion } = await import("./avs-playlist")
    const warn = vi.spyOn(console, "warn").mockReturnValue(undefined)

    noteLoaderVersion("1.36.2")
    noteLoaderVersion("1.36.2")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain("1.36.2")
    expect(warn.mock.calls[0][0]).toContain("1.35")

    noteLoaderVersion("1.35.40")
    noteLoaderVersion(null)
    expect(warn).toHaveBeenCalledTimes(1)

    noteLoaderVersion("2.0.0")
    expect(warn).toHaveBeenCalledTimes(2)
  })

  test("puts the noted version in the error message", async () => {
    vi.resetModules()
    const mod = await import("./avs-playlist")
    vi.spyOn(console, "warn").mockReturnValue(undefined)
    mod.noteLoaderVersion("1.36.2")
    const { text } = await cipherPlaylist()

    const error = await mod
      .decryptAvsPlaylist(text, new Headers(), BASE)
      .catch((e) => e)

    expect(error).toBeInstanceOf(mod.AvsCipherError)
    expect(error.loaderVersion).toBe("1.36.2")
    expect(error.message).toMatch(
      /^avs envelope failed \(server avs-loader 1\.36\.2, cipher written for 1\.35\): /
    )
  })
})
