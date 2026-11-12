# web

The rebuilt AnimeVsub front end. It lives beside the old Vue app (`apps/desktop-web`), which stays untouched until the cutover. Plan: `docs/webapp-rebuild/plan.md`.

Stack: React 19, Vite, TanStack Router and Query, Tailwind 4, Base UI, zod, Vitest and Testing Library.

## Commands

Run everything through Nx from the repo root.

| Command                                                | What it does                                          |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `pnpm nx dev web`                                      | Dev server on http://localhost:5180                   |
| `pnpm nx run-many -t typecheck lint test build -p web` | Static checks, unit tests and the production build    |
| `pnpm nx verify web`                                   | Typecheck and unit tests, then a pass or fail summary |

`verify` writes logs to `apps/web/artifacts/verify/` (and `summary.json`).

Unit tests sit in a `__tests__` folder beside the code they cover. Component tests run in jsdom and mount the real route tree over the mock data in `src/components/__mockData__/` (see `src/test/`). There is no browser test suite, so layout, CSS and browser behaviour such as hls.js playback, fullscreen, scrolling, hover timing and reduced motion are not covered by tests.

## TMDB art

The home hero and watch backdrop (original size), the new episodes and airing shelves (w780) and the watch screen (backdrop and episode stills) swap in TMDB art from the art module of `apps/api`. Set `VITE_API_URL` to the service root (for example `http://localhost:3100`, see `apps/api/README.md`) to turn the lookup on. The service holds the TMDB key and the database, so the bundle carries neither. The hero also replaces each slide's description with the service's Vietnamese `overview` when the lookup answers one. The source site cuts its card excerpt at about 70 characters and ends it with `...`, so the hero keeps that excerpt only when `overview` is null or missing. Cards and the top 10 hover keep the source excerpt.

The page posts its titles to `/v1/art/lookup` and applies the `ready` entries. A title the service has not seen answers `pending` while it is matched in the background, so the page asks again after 3, 6 and 12 seconds and stops as soon as nothing is pending. The home art loads after the home data so a slow art API never delays first paint. The Top 10 posters keep the source image. Without `VITE_API_URL`, or when the request fails, times out after 3 seconds or answers an unexpected shape, the page shows the source site's own images.

A card or hero slide does not show the source image first and swap it later. `HomeArt` records which slugs an answer covers (`answered`) and which it left `pending`, and `markArtPending` sets `artPending` on every title that is still waiting, so `PosterCard` (cover, thumb and hover preview) and `Hero` render a shimmer skeleton (`card:art-skeleton`, `hero:art-skeleton`) in the same box. A title waits while the API is configured and no answer covers its slug yet, which also holds for slugs a later shelf or listing page adds, or while its own entry is `pending` and polls remain. It settles on `ready` (TMDB image, else the source image), `none`, an absent slug, a failed or timed out lookup, or a `pending` that outlives the last poll. The worst case is about 33 seconds: the polls wait 3, 6 and 12 seconds and each of the four requests can take up to 3 seconds. Without `VITE_API_URL` nothing waits. The watch page does not use this.

The watch screen and the details modal both read the watch page through `useWatchPage`, and its lookup also carries `otherNames`, the titles the page lists under its heading in `h2.SubTitle` (English, romaji or pinyin). `parseOtherNames` in `src/lib/titles/watch.ts` splits that text on commas, semicolons and a slash with a space on each side, drops a trailing year such as `(2018)` and a trailing `Tập 228` or `Full`, drops repeats and the page title, and keeps at most 5 names of at most 120 characters. A page without a subtitle sends no `otherNames`. The service stores the names and uses them to find the show on MyAnimeList and TMDB, also for later lookups from listing cards, which carry none (see `apps/api/README.md`). No extra request is made for them.

## Transport

Routes never fetch directly. They call `useTransport()` from `src/lib/transport/`. `main.tsx` provides `ExtensionTransport`, which calls `Http` from `client-ext-animevsub-helper`, so the Animefork Helper extension does the fetching with the site's cookies. Relative URLs get the upstream origin (`VITE_UPSTREAM_ORIGIN`) and the `#animevsub-vsub` suffix. It throws `ExtensionMissingError` when the extension is absent. The app has no other transport, so it only works in a browser with the extension.

Tests use `ReplayTransport` (`src/test/replay-transport.ts`), which serves files from a `__mockData__` folder, mapped from the URL path (`/` is `index.html`, `/a/b/` is `a/b.html`).

In dev, `window.__app` exposes `route()`, `queryKeys()`, `shelves()` (the id and card paths of each shelf the home page currently renders) and the active `transport`.

## Mock data

Test pages live in a `__mockData__` folder beside the `__tests__` folder that reads them, and each folder holds only the pages its tests read. They are excerpts of the live site, captured from a real browser on 2026-11-10 to 2026-11-12, with scripts, ads, inline handlers and cast lists removed. Each file starts with an HTML comment naming its source and date. They are not full pages. Image URLs stay the upstream `https://cdn.animevietsub.best/...` URLs, and nothing loads them in jsdom.

- `src/components/__mockData__/` backs the component tests through `renderApp` (`src/test/`): the home page, the jp lists with their later pages, the upcoming list and three watch pages.
- `src/lib/titles/__mockData__/` backs the parser tests: the same home page and watch pages, the season pages, and the jp lists.
- `invalid-title` in both is the home markup cut down to one card per section, with one hero card given a non-numeric rating to prove the zod error path.

The upstream is behind Cloudflare, so `curl` gets a 403, and nothing here tries to bypass that. Capture a new page from a real browser with the extension installed, trim it to what a test reads, and save it under the path `ReplayTransport` maps its URL to.

## Home data

`src/lib/titles/` turns the home page into shelves.

- `card-parser.ts` reads one `.TPostMv` card with DOM selectors, and `TitleSchema` (zod) rejects a malformed card instead of letting NaN through. A card without genres, description or studio is valid. The hero carousel has no episode label, so its `.Info .Time` progress text (such as `05/12`) fills `episodeLabel`.
- `home.ts` parses the hero, the new episodes and the top 10 from `GET /`, and the season tab's `href` from the same page. `fetchSeason` then reads the site's list for that season and year filtered to country jp (`japaneseSeasonPath`: `/season/autumn/2026/` becomes `/danh-sach/all/all/autumn/2026/all/all/jp/`), because the season page itself mixes in Chinese donghua. A season path in another shape is read as it is. The season is never computed from the date.
- `shelves.ts` is the pure `buildHome`. It orders the shelves, dedupes new episodes against airing this season, drops a shelf under 8 titles and caps airing at 12.

The listing page reads every season page; see Airing listing below. The home route runs two queries, `['home']` and `['season', seasonPath]`. A slow or failed season request only affects its own shelf.

## Home page

`src/routes/index.tsx` renders what `buildHome` returns, in order, inside the app shell (`src/routes/__root.tsx`: header, `<main>`, footer, and a tab bar below 1100px).

- `components/hero.tsx` is the carousel over the hero shelf. It cross-fades in 600 ms, advances every 7 s, and holds still on hover, on keyboard focus inside it, after the pause button, and always under `prefers-reduced-motion` (the pause button is not rendered then).
- `components/shelf.tsx` is one shelf: a snap scroller, arrows from 1100px up (44px wide pills, at most 88px and never taller than the card art, which fade in while the row is hovered or has keyboard focus), arrow keys between covers, and a skeleton while loading.
- `components/poster-card.tsx` is one card. After 250 ms of hover or keyboard focus it opens a 340px preview, clamped to the viewport, that grows out of the cover in 220 ms and shrinks back in 140 ms (`data-state` is `open` then `closing`, and there is no motion under `prefers-reduced-motion`). Touch devices get no preview. Only the new episodes shelf shows the `Tập mới` badge.
- The art of a default card is cropped to `--card-art-ratio` (`src/styles.css`, 16:9). Change that one variable to change the crop. Portrait posters keep their top (`object-top`).

The search and notification buttons in the header are rendered but disabled until those features exist. The account slot is described under Accounts below. There is no "Thêm vào danh sách" control yet because there is no My list. Title links go to the placeholder route `/title/$`.

The `data-testid` names the component tests use: `hero`, `hero:slide:<index>`, `hero:description`, `hero:pause`, `hero:prev`, `hero:next`, `hero:counter`, `shelf:<id>`, `shelf:<id>:scroll-left`, `shelf:<id>:scroll-right`, `shelf:<id>:see-all`, `shelf:<id>:loading`, `card:<path>`, `card:art-skeleton`, `hero:art-skeleton`, `card:<path>:preview`, `header`, `nav:<id>`, `tab-bar`, `tab:<id>`, `footer`.

## Airing listing

`/airing-this-season` (`src/routes/airing-this-season.tsx`) is where the Xem tất cả link of the Đang chiếu mùa này shelf goes. The other shelves still link to `/browse`. The page lists the whole season, not the 12 of the shelf, and does its sorting and paging in the browser.

- Data. `home.ts` names the season path (the `['home']` query is shared with the home route). `season-pages.ts` reads page 1 of that jp list (`['season-first', path]`, which also gives the page count from `.wp-pagenavi .pages`, "Trang X của N", capped at 10 and 1 when the pager is missing) and then pages 2 to N at `<list path>/trang-N.html` (`['season-rest', path, N]`). A later page that fails is skipped and the page says `Chưa tải hết danh sách.` Titles repeated across pages are dropped. Until the rest has arrived the sort dropdown and the pager are disabled, and only the untouched first page shows.
- MAL data. Once every page is in, the titles go to the art lookup like the home shelves (chunked at 50, polled while pending). It feeds the rating rank below. Without `VITE_API_URL`, or when the lookup fails, the page works on scraped data and the rank uses the site's rating and votes alone. While the lookup is pending the same holds, so the order can change when MAL data arrives.
- URL. `sort` (`recent`, `rating-desc`, `rating-asc`, `views-desc`; an old value such as `score-desc` or `voters-desc` falls back to `recent`) and `page` (default 1) are search params, validated with a fallback to the default so a bad value never errors. Defaults are left out of the URL, other params such as `transport` are kept. Changing the sort resets the page and replaces the history entry, changing the page pushes one and scrolls to the grid.
- Dropdown. `components/dropdown.tsx` is a custom menu button (the native select menu does not match the design). `aria-haspopup="menu"`, `role="menu"` with `menuitemradio` options. Opening focuses the selected option, the arrows, Home and End move, Escape, Tab, a pick or a click outside close it and focus returns to the trigger. Near the right edge of a phone the menu aligns to the trigger's right edge.
- Sorts. `recent` (Tập mới nhất, the default) is the site's own newest-first order. `rating-desc` (Đánh giá: cao đến thấp) and `rating-asc` (Đánh giá: thấp đến cao) rank by a vote-weighted rating. `views-desc` (Xem nhiều nhất) puts titles without a view count last. Every sort keeps the site's order for ties. The rating value is never shown and never rounded before sorting. The card's hover preview is the default one on every sort, with the AVS and MAL chips as on the home shelves.
- Rating rank (`lib/titles/rating-rank.ts`). A plain average lets 9.5 from 100 voters beat 9.0 from 20000, so each source gets an IMDb-style weighted rating, `WR = v/(v+m) * R + m/(v+m) * C`, where `R` is the title's score and `v` its votes. Per source (AVS: `rating` and `avsVoters`, MAL: `mal.score` and `mal.voters`), `C` is the mean score and `m` the median vote count over the titles in the loaded list that have a score and votes above 0. Both come from the list, so there are no constants and each source shrinks toward its own mean. A score with missing or zero votes counts as `v = 0`, which gives `C`. A source with no voted titles in the list is not shrunk and uses the plain mean of its scores as `C`. A title without a score for a source skips that source. Each source is compared with its own season average, because AVS scores run higher than MAL scores, so the rank value is the mean of the title's `WR - C` over its available sources and having MAL data does not lower a title. The AVS score always exists. `C` and `m` depend on the list, so the order can shift when MAL data arrives after the first load. That is expected, the controls are disabled until every season page is in.
- Paging. 30 titles a page over the sorted list (`lib/ui/paging.ts`). The pager hides at one page, shows every page number up to 7 and collapses to first, last and the neighbours of the current page with ellipses above that, and below 768px shows `Trang X / N` instead of the numbers. A page past the end shows the last page.

The `data-testid` names: `listing`, `listing:count`, `listing:sort`, `listing:sort:option:<value>`, `listing:grid`, `listing:loading`, `listing:empty`, `listing:partial`, `listing:pager`, `listing:prev`, `listing:next`, `listing:page:<n>`, `listing:summary`.

## Upcoming listing

`/upcoming` (`src/routes/upcoming.tsx`) is where the Xem tất cả link of the Sắp ra mắt shelf goes. It reads `/anime-sap-chieu/` (`UPCOMING_PATH`) through the same `TitleListing` as the airing listing, so the source's 2 pages (30 and 17 cards in the fixtures) load the same way and the sort and page search params behave the same. The cards carry the countdown tag of the home shelf (`upcoming` on `TitleListing`), and the default sort is the site's own order.

## Accounts

`/sign-in`, `/sign-up` and `/verify-email` (`src/routes/`) render in `AuthLayout` without the header, footer and tab bar (`isFullScreen` in `src/routes/__root.tsx`). They talk to the account endpoints of `apps/api` (see "Account endpoints" in `apps/api/README.md`) through `src/lib/auth/client.ts`, which uses the API's zod schemas, sends the session cookie (`credentials: 'include'`) and answers `{ ok, data | error }` instead of throwing. The error kinds are `invalid_credentials`, `invalid_token`, `invalid_request`, `rate_limited` (with `retryAfterSeconds` from `Retry-After`) and `network`, which also covers an unset `VITE_API_URL`, a 5xx and an unexpected body. Without `VITE_API_URL` the session is signed out and a form shows the generic failure message.

`useSession()` (`['session']` query) is `loading`, `signedOut` or `signedIn`. Sign-in writes the user to that query, sign-out clears it, and a signed-in visitor on `/sign-in` or `/sign-up` is sent home. The header (`components/account-menu.tsx`) shows nothing while the session loads, a "Đăng nhập" link when signed out, and the avatar with a profile menu (email and "Đăng xuất") when signed in. The mailed link is `/verify-email#token=...`. The page reads the token from the fragment once, removes it from the URL and posts it once, because a token is single use. All auth copy is in `src/lib/auth/copy.ts`.

Not built, because the API has no support: display name, subtitle language, terms, remember me, password reset, email sign-in link and resending the verification mail.
