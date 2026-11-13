# Home

The landing page: a hero carousel over five shelves (new episodes, top 10, airing this season, upcoming), inside the app shell (header, footer, and a tab bar below 1100px). Cards open a hover preview.

## Sub-features

- Hero carousel: auto-advance every 7s, pause button, prev, next, counter (`1 trên 10`).
- Hero and details modal trailers: the active slide plays its YouTube trailer once (`trailer` with `data-phase` loading, playing or ended), holding the slide until it ends; `hero:mute` and `details:mute` show while it plays. The video fades in as soon as it plays. For its first 5s the player is laid out 20 times larger and scaled down, so YouTube's start overlay is a speck, then `data-settled` marks it back at natural size. The card hover video (`card:promo-video`) is the same component, looped. Proved by `../scripts/trailer-hero-modal.mjs`. Read the player through `window.YT.get(iframe.id)` (`isMuted()`), never to drive the user path.
- One sound switch for every trailer: muting or unmuting the hero, the details modal or a card popover (`card:promo-video:sound`, a round button at the video's bottom-right) applies to all of them, and a trailer mounted later starts with it. Each page load starts muted.
- Continue watching popover trailer: a `card:continue:<slug>` popover plays the title's MAL trailer once the home lookup answers. The shelf needs a signed-in viewer, so `../scripts/trailer-sound-continue.mjs` answers `v1/auth/me` and `v1/watch-progress` with `page.route`, built from the live airing titles, and says so in its proof. Address a card by its exact `card:continue:<slug>` testid, because the prefix also matches its `:progress` bar.
- Shelves: snap scroller, arrows from 1100px up, "Xem tất cả" link.
- Poster card hover preview after 250ms.
- Art skeletons while TMDB art loads (only when `VITE_API_URL` answers).

## How to get to it (user POV)

- Open `/`, or click the brand (`brand`).
- Header nav: `nav:home`, `nav:browse`, `nav:schedule`, `nav:rankings`, `nav:my-list`. Below 1100px the same items are `tab:<id>` in `tab-bar`.

## Driving it with Playwright

Proved end to end by `../scripts/home-live.mjs`: `EV=$(cat apps/web/artifacts/verify-web/latest) node .claude/skills/verify-web/scripts/home-live.mjs`.

- Loaded: `page.waitForSelector('[data-testid="hero"]', { timeout: 60000 })`. Observable: `window.__app.transport.constructor.name === 'ExtensionTransport'` and `window.__app.shelves()` lists `hero, new-episodes, top-10-today, airing-this-season, upcoming`, each with cards (seen: 10, 12, 10, 12, 10).
- Pause then next: `r.click(page.getByTestId('hero:pause'), ...)`, `r.click(page.getByTestId('hero:next'), ...)`. Observable: `hero:counter` changes from `1 trên 10` to `2 trên 10`. Pause first so the 7s timer cannot race the read.
- See all: `r.click(page.getByTestId('shelf:airing-this-season:see-all'), ...)`. Observable: path `/airing-this-season` and `listing:grid` visible. The other shelves link to `/browse`.
- The hover preview closes on any scroll in the page, so a late layout shift can close it mid-check. Re-run once before blaming the change.
- Hover a card (not scripted): `page.locator('[data-testid="shelf:airing-this-season"] [data-testid^="card:/"]').first().hover()`, wait 600ms. Observable: `<card testid>:preview` exists.
- Open a title (not scripted): a `card:/phim/<slug>/` goes to the placeholder `/title/$` route, not the watch page.

## Gotchas

- Art lookups need `VITE_API_URL` (3100) up. Without it cards show a skeleton for up to ~33s in the worst case. Assert layout, not images.
- Search and notification buttons in the header are disabled on purpose.
- The hover preview does not exist on touch devices. Use the default 1280x800 viewport.
- Reduced motion removes the pause button.
- Titles and counts are live. Never assert a title.
