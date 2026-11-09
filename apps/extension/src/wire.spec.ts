// Guards what an already-published client (desktop-web pins 1.0.31) observes from a new
// extension, and what the new client exports.
import { describe, expect, test, vi } from "vitest"

import allowlist from "../allowlist.json" with { type: "json" }
import clientPkg from "../client/package.json" with { type: "json" }
import chromeBaseline from "../fixtures/manifest.chrome-mv3.json" with { type: "json" }
import pkg from "../package.json" with { type: "json" }

import { EMBED_CHANNEL, EMBED_VERSION } from "./embed/protocol"
import { manifestFor } from "./manifest"
import { targets } from "./targets"

const input = { ...pkg, hosts: allowlist.hosts }

describe("wire protocol", () => {
  test("embed channel and version are frozen", () => {
    expect([EMBED_CHANNEL, EMBED_VERSION]).toEqual(["__animevsub_embed__", 1])
  })

  test("client export names do not shrink", async () => {
    // The client reads document.documentElement.dataset at import time.
    vi.stubGlobal("document", { documentElement: { dataset: {} } })
    const client = await import("./client")
    expect(Object.keys(client).sort()).toEqual([
      "EMBED_CHANNEL",
      "EMBED_VERSION",
      "Http",
      "createEmbedBridge",
      "customReferer",
      "execTabs",
      "installEmbedGlobal",
      "isAnimevietsubHost",
      "isEmbedMessage",
      "matchOrigin",
      "serializeError",
      "setReferrers",
      "tabsApi"
    ])
  })

  test("extension and client release in lockstep", () => {
    expect(clientPkg.version).toBe(pkg.version)
  })
})

describe("manifest", () => {
  const chrome = targets.find((t) => t.name === "chrome-mv3")!

  test("chrome-mv3 equals the pre-migration build except the background bundle path", () => {
    const { background, ...rest } = manifestFor(chrome, input)
    const { background: oldBackground, ...oldRest } = chromeBaseline
    expect(rest).toEqual(oldRest)
    expect(oldBackground).toEqual({
      service_worker: "./dist/background/index.mjs"
    })
    expect(background).toEqual({ service_worker: "./dist/background/index.js" })
  })

  test.each(targets)(
    "$name only differs from chrome in its background and gecko keys",
    (target) => {
      const {
        background: _b,
        browser_specific_settings: _g,
        ...rest
      } = manifestFor(target, input) as Record<string, unknown>
      const { background: _b2, ...chromeRest } = manifestFor(chrome, input)
      expect(rest).toEqual(chromeRest)
    }
  )

  test("firefox runs the background as an event page with a gecko id", () => {
    const firefox = manifestFor(
      targets.find((t) => t.name === "firefox-mv3")!,
      input
    )
    expect(firefox.background).toEqual({
      scripts: ["./dist/background/index.js"]
    })
    expect(firefox.browser_specific_settings?.gecko.id).toBe(
      "{26005fb7-3d84-4144-a688-a058944123b3}"
    )
  })
})
