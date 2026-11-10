# web

The rebuilt AnimeVsub front end. It lives beside the old Vue app (`apps/desktop-web`), which stays untouched until the cutover. Plan: `docs/webapp-rebuild/plan.md`.

Stack: React 19, Vite, TanStack Router and Query, Tailwind 4, Base UI, zod, Vitest, Playwright.

## Commands

Run everything through Nx from the repo root.

| Command                                                | What it does                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `pnpm nx dev web`                                      | Dev server on http://localhost:5180                               |
| `pnpm nx run-many -t typecheck lint test build -p web` | Static checks, unit tests and the production build                |
| `pnpm nx e2e web`                                      | Playwright replay tests                                           |
| `pnpm nx verify web`                                   | Typecheck, unit tests and replay e2e, then a pass or fail summary |

`verify` writes logs to `apps/web/artifacts/verify/` (and `summary.json`) and points at the Playwright report, results and screenshots under `apps/web/artifacts/e2e/`.

Playwright drives the installed Google Chrome so no browser download is needed. CI sets `PW_CHANNEL=chromium` after `playwright install chromium`.

## Transport

Routes never fetch directly. They call `useTransport()` from `src/lib/transport/`, which returns one of two implementations.

- `ExtensionTransport` calls `Http` from `client-ext-animevsub-helper`, so the AnimeVsub Helper extension does the fetching with the site's cookies. Relative URLs get the upstream origin (`VITE_UPSTREAM_ORIGIN`) and the `#animevsub-vsub` suffix. It throws `ExtensionMissingError` when the extension is absent.
- `ReplayTransport` serves files from `public/fixtures/<set>/`, mapped from the URL path (`/` is `index.html`, `/a/b/` is `a/b.html`).

Selection: `?transport=replay` in the URL, else `VITE_TRANSPORT=replay`, else the extension. In replay mode `?fixtures=<set>` picks the fixture set (default `default`).

In dev, `window.__app` exposes `route()`, `queryKeys()` and the active `transport`.

## Fixtures

**The fixtures in `public/fixtures/default/` and `public/fixtures/invalid-title/` are synthetic.** They are hand-written to exercise replay and are not captured from the upstream site. `invalid-title` is deliberately malformed to prove the zod error path.

Real fixtures must be captured from a real browser with the extension. The upstream is behind Cloudflare, so `curl` gets a 403, and nothing here tries to bypass that. `scripts/capture-fixtures.ts` opens Chrome for Testing with the built extension, reads each page through `ExtensionTransport`, and writes it to `public/fixtures/captured/`. It needs a human at the keyboard and stops if a page does not answer 200. The header of the script lists the prerequisites. `node scripts/capture-fixtures.ts --dry-run` prints the plan without a browser.

The home page parser in this PR is a placeholder that reads the synthetic markup. Real parsers and captured fixtures arrive with the catalog package.
