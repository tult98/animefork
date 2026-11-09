# avs-loader tools

The iframe server (`stream.googleapiscdn.com`) ships its playlist cipher inside
an obfuscated player script, `avs-loader.min.js`. When the server updates that
script, the cipher in `apps/desktop-web/src/logic/avs-playlist.ts` may break.
These two commands fetch the new script and turn it into readable code so the
maintainer can diff the logic against `avs-playlist.ts`.

Checked against v1.35.34.

## Use

This folder is outside the pnpm workspace, so install with npm:

```sh
npm install
npm run fetch -- https://stream.googleapiscdn.com/player/<id>
npm run deobfuscate -- out/avs-loader-<version>.min.js
```

`fetch` reads the player page (sending the `Referer` the CDN checks), finds
`/static/avs-loader.min.js?v=<version>` and saves it as
`out/avs-loader-<version>.min.js`. Cloudflare blocks Node on `/player/`. If that
fails, open the page in Chrome, copy the script URL from the network tab and run
`npm run fetch -- --script "<url>"`. The `/static/` file downloads fine.

`deobfuscate` writes `out/avs-loader-<version>.clean.js` through three stages:

1. `obfuscator-io-deobfuscator` (control flow, proxies, dead code)
2. string-table reveal: runs the script's prefix up to
   `,!function(q){'use strict';` in a `vm` context and replaces every
   `a0hgs0b(N, X)` with its literal
3. a Babel pass that folds string concatenation and inlines the `z` helper table

It prints the remaining `a0hgs0b(` calls (must be 0) and `z[` references. A
stage that cannot find what it expects exits with its name. A changed obfuscator
layout is the likely cause, for example a different split point in stage 2.

`out/` is gitignored. Never commit the server's script or its output.

## Anchors that survive obfuscation

Names are renamed on every release. These strings and constants are not, so grep
for them in the clean file:

- `X-Envelope`, `jti`, `_t=`, `_c=`
- `AES-GCM`, `AES-CTR`, `url-cipher|`
- `1664525` / `1013904223` (shuffle LCG)
- `2166136261` / `16777619` (xorshift seed hash)

## v1.35.34 map

Function names are from that release's clean file and will change.

| clean file | `avs-playlist.ts` |
| --- | --- |
| `K` | `parseEnvelope` |
| `X`, `Y` | `lcg`, `unshuffle` (`shufflePlan`) |
| `Z` | `decryptBlob` |
| `H`, `J` | `xorshift32`, `derange` (`maskPlan`) |
| `a3` | `sessionKeyOf` |
| `load` of the fragment loader (second `this.load`, the one using `url-cipher|`) | `resolvePlaceholderUrl` |

`Z` is called from the playlist loader's `load` (the first `this.load`, which
matches `_c=` and `_t=`). In `Z`, the HMAC message is
`uid:ts:sk[:suffix]`, where the suffix comes from `_avsCryptoHarden` and
`_avsEnvSnapshot`. `avs-playlist.ts` assumes `:0`.
