# Extension reorganization: WXT for the extension, tsdown for the client, no hand-rolled glue we can buy

Companion to `docs/extension-modernization/rationale.md` (the earlier collapse into one tsdown build, already merged). Candidate designs and prototypes are scratch work. Their conclusions are merged here.

## Problem

The extension builds and passes CI. The remaining debt is internal shape and dated parts.

- The content script imports its types from the background bundle, and the client imports from both. There is no shared module.
- Request and abort code exists twice, in the service worker and in `inject2.ts`. The request-id and listener pattern exists three times in the client.
- `src/logic/` is a catch-all. File names mix camelCase and kebab-case. `inject2.ts` and the `.global` suffix are historical.
- About 25 `eslint-disable` or `as unknown as` escapes sit in `src/`.
- Dated parts: `@tachibana-shin/webext-bridge` 6.0.0-rc3 (Nov 2022, never stable), `webextension-polyfill` 0.9.0, `cookie` 0.5.0 with a stub `@types/cookie`, `js-base64`, an unused `vite` declaration, and the MV2 branches and `__MV3__` flag that are always true.
- Firefox bug: `create-rule.ts` and `install-embed-rules.ts` read `chrome.declarativeNetRequest` enums that addons-linter reports as unsupported on Firefox (runtime unverified).

## Usage (caller's view)

```sh
pnpm nx run-many -t lint typecheck test build -p extension-animevsub-helper client-ext-animevsub-helper
pnpm nx dev extension-animevsub-helper          # wxt dev, Chrome
pnpm nx dev:firefox extension-animevsub-helper  # wxt dev -b firefox
pnpm nx pack extension-animevsub-helper         # wxt zip, both browsers
```

Adding a content script is one file, `src/entrypoints/foo.content.ts`. Adding a relay-to-worker message is one line in `src/shared/messages.ts` plus a handler and a call site, and the compiler checks both ends. Page code that uses the client does not change.

## Synthesis decision

**Base.** Candidate 2's shape: WXT 0.21.5 for the extension, tsdown 0.23.x for the client only, `@webext-core/messaging` for relay-to-worker messages, native `browser` instead of the polyfill. It owns the least code, follows the industry-standard `entrypoints/` convention, and its prototype passed lint, typecheck, test and build under Nx and Firefox lint.

**Grafts from candidate 1.**

- Step 0 characterization specs before any change: a `createRule` snapshot with ids stripped, a base64 vector set, and a cookie differential.
- Own an 8-line `toSetCookie` instead of upgrading `cookie`. Candidate 1 measured it byte-identical to `cookie@0.5.0` on four cases. `cookie@2.0.2` changes the value encoding and throws on invalid name, domain or path. A throw inside the worker would fail the whole request. This replaces candidate 2's plan to bump `cookie`.
- Behavior changes stay out of the reorganization and ship as separate, individually revertible steps: cookie expiry fix, tabs method allowlist, rules derived from persisted state.
- The frozen URL-suffix protocol (`#key|`, `_extra|`, `o|`, `ro|`, `_ua<name>|`) that the DNR rules match is pinned by the step 0 snapshot.

**Rejected from candidate 2 for now.**

- `world: "MAIN"` content scripts. Firefox 128 support is verified only by the linter schema. Ship the unlisted-script plus injector shape, which has the same runtime behavior as today. MAIN world is a later, separate step that needs a real browser.
- `cookie` 2.0.2, as above.
- `crx` to `crx3` and `@wxt-dev/auto-icons`: unverified in a browser, deferred.

**Rejected from candidate 1.**

- Hand-written 40-line messaging layer and `no-restricted-imports` bundle fences. WXT's entrypoint convention and `@webext-core/messaging` cover the same ground with less code we own. Keep the idea of one shared directory (`src/shared/`) that every entrypoint may import and nothing else may be imported sideways.
- Flat `dist/<target>/<name>.js` bundles. WXT owns the output layout, which only the deleted `targets.ts`, `manifest.ts` and `inject.ts` read.

## Target tree

```
apps/extension/
  wxt.config.ts            manifest, hosts, per-browser options (replaces tsdown.config.ts, targets.ts, manifest.ts)
  public/icon.png
  src/
    entrypoints/
      background.ts        shell: register handlers
      relay.content.ts     page CustomEvents <-> worker messages
      inject.content.ts    injector (unlisted page scripts via web_accessible_resources)
      embed.unlisted.ts    page-world embed bridge
      page-patch.unlisted.ts  page-world request patch (was inject2)
    background/            http-proxy, cookies, referrers, rules/
    shared/                types, messages, hosts, base64, detail, uuid, embed-protocol, embed-client
  client/                  own Nx targets, tsdown.config.ts, src/{index,embed}.ts
  config/allowlist.json  config/map-referer.json
```

## Tradeoffs accepted

- A pre-1.0 framework, pinned exact, in exchange for deleting about 400 lines of manifest and build plumbing.
- Two build tools, WXT for the extension and tsdown for the client, because WXT cannot emit the library's dts and cjs/esm pair.
- A cached `prepare:types` Nx target (`wxt prepare`) that lint, typecheck and build depend on.
- `test` depends on `build` because the manifest spec compares the generated manifest to a fixture.
- No browser run is possible here. Every claim about Chrome or Firefox runtime behavior is unverified until someone loads the build.

## Open questions

- Which `chrome.tabs` methods does desktop-web call? Any allowlisted page can run any method today. Narrowing it is a security win and a contract change.
- Is the `expirationDate * 1000` fix acceptable as a visible value change for desktop-web's cookie parser?
- Should the `.crx` get a CI-held `.pem` so its id is stable?
- Should WXT's default minification stay, or be turned off for AMO source review?
- Does Firefox 128 honor manifest `world: "MAIN"`? Gate the later MAIN-world step on a manual run.

## Implementation order (each step leaves lint, typecheck, test, build green)

1. Characterization specs on today's code.
2. Version bumps and `sharedGlobals` in `nx.json`.
3. Delete dead MV2 code and `__MV3__`. Replace the DNR enum lookups with string literals.
4. `js-base64` to native `atob`/`btoa`. `cookie` to an owned `toSetCookie`.
5. Messaging to `@webext-core/messaging`. Shared types move out of `background/` and `contentScripts/`.
6. WXT adoption with the entrypoints layout, native `browser`, the client as its own tsdown project, `pack` as `wxt zip`.

Follow-ups, not in this pass: MAIN-world scripts, cookie expiry, tabs allowlist, rules from persisted state, `crx3`, auto-icons.
