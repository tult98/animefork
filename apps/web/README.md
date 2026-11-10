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

## TMDB art

The watch screen swaps in a TMDB backdrop and episode stills when `title_art` and `episode_art` have rows for the season slug. They are filled by `tools/art-sync`. Set `VITE_ART_API_URL` to a PostgREST root (for example `http://localhost:3000`, see `tools/art-sync/README.md`) to turn the lookup on. `VITE_ART_API_KEY` is optional and is sent as a bearer token only when set, because PostgREST's anonymous role needs none. Without them, or when the request fails, the screen shows the source site's own images.

## Transport

Routes never fetch directly. They call `useTransport()` from `src/lib/transport/`, which returns one of two implementations.

- `ExtensionTransport` calls `Http` from `client-ext-animevsub-helper`, so the AnimeVsub Helper extension does the fetching with the site's cookies. Relative URLs get the upstream origin (`VITE_UPSTREAM_ORIGIN`) and the `#animevsub-vsub` suffix. It throws `ExtensionMissingError` when the extension is absent.
- `ReplayTransport` serves files from `public/fixtures/<set>/`, mapped from the URL path (`/` is `index.html`, `/a/b/` is `a/b.html`).

Selection: `?transport=replay` in the URL, else `VITE_TRANSPORT=replay`, else the extension. In replay mode `?fixtures=<set>` picks the fixture set (default `default`).

In dev, `window.__app` exposes `route()`, `queryKeys()`, `shelves()` (the id and card paths of each shelf the home page currently renders) and the active `transport`.

## Fixtures

**The fixtures in `public/fixtures/default/` are excerpts of the live site, captured from a real browser on 2026-11-10.** `default/index.html` holds the `.MovieListSldCn`, `#single-home` and `#hot-home` sections of the home page. `default/season/autumn/2026.html` holds the first 22 cards of the autumn 2026 season page, the page the home page's season tab links to. Each file starts with an HTML comment naming its source and date. Scripts, ads and inline handlers were removed, and the cast lists were dropped because no parser reads them. They are not full pages. Image URLs stay the upstream `https://cdn.animevietsub.best/...` URLs, and the Playwright fixtures answer those requests locally so no test depends on the CDN.

`invalid-title` is the same markup cut down to one card per section, with one hero card given a non-numeric rating to prove the zod error path.

Full pages must be captured from a real browser with the extension. The upstream is behind Cloudflare, so `curl` gets a 403, and nothing here tries to bypass that. `scripts/capture-fixtures.ts` opens Chrome for Testing with the built extension, reads each page through `ExtensionTransport`, and writes it to `public/fixtures/captured/`. It needs a human at the keyboard and stops if a page does not answer 200. The header of the script lists the prerequisites. `node scripts/capture-fixtures.ts --dry-run` prints the plan without a browser.

## Home data

`src/lib/titles/` turns the home page into shelves.

- `card-parser.ts` reads one `.TPostMv` card with DOM selectors, and `TitleSchema` (zod) rejects a malformed card instead of letting NaN through. A card without genres, description or studio is valid. The hero carousel has no episode label, so its `.Info .Time` progress text (such as `05/12`) fills `episodeLabel`.
- `home.ts` parses the hero, the new episodes and the top 10 from `GET /`, and the season tab's `href` from the same page. `fetchSeason` then reads that path. The season is never computed from the date.
- `shelves.ts` is the pure `buildHome`. It orders the shelves, dedupes new episodes against airing this season, drops a shelf under 8 titles and caps airing at 12.

The home route runs two queries, `['home']` and `['season', seasonPath]`. A slow or failed season request only affects its own shelf.

## Home page

`src/routes/index.tsx` renders what `buildHome` returns, in order, inside the app shell (`src/routes/__root.tsx`: header, `<main>`, footer, and a tab bar below 1100px).

- `components/hero.tsx` is the carousel over the hero shelf. It cross-fades in 600 ms, advances every 7 s, and holds still on hover, on keyboard focus inside it, after the pause button, and always under `prefers-reduced-motion` (the pause button is not rendered then).
- `components/shelf.tsx` is one shelf: a snap scroller, arrows from 1100px up (44px wide pills, at most 88px and never taller than the card art, which fade in while the row is hovered or has keyboard focus), arrow keys between covers, and a skeleton while loading.
- `components/poster-card.tsx` is one card. After 250 ms of hover or keyboard focus it opens a 340px preview, clamped to the viewport, that grows out of the cover in 220 ms and shrinks back in 140 ms (`data-state` is `open` then `closing`, and there is no motion under `prefers-reduced-motion`). Touch devices get no preview. Only the new episodes shelf shows the `Tập mới` badge.
- The art of a default card is cropped to `--card-art-ratio` (`src/styles.css`, 16:9). Change that one variable to change the crop. Portrait posters keep their top (`object-top`).

The search, notification and account buttons in the header are rendered but disabled until those features exist. There is no "Thêm vào danh sách" control yet because there is no My list. Title links go to the placeholder route `/title/$`.

The `data-testid` names the e2e tests use: `hero`, `hero:slide:<index>`, `hero:pause`, `hero:prev`, `hero:next`, `hero:counter`, `shelf:<id>`, `shelf:<id>:scroll-left`, `shelf:<id>:scroll-right`, `shelf:<id>:see-all`, `shelf:<id>:loading`, `card:<path>`, `card:<path>:preview`, `header`, `nav:<id>`, `tab-bar`, `tab:<id>`, `footer`.
