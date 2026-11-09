# Home

The landing page (`/`) shows a hero slider of featured anime followed by rows of cards (new, trending), a top-bar with search, settings and a "Log in" button, and the left drawer.

## Sub-features

- Featured anime cards linking to `/phim/<slug>/`
- Top bar: menu toggle (opens drawer), logo link back to `/`, search box, settings, "Log in"
- Left drawer with navigation entries (showtimes, rankings, genres)

## How to get to it (user POV)

Open the site root. Click the "nimeVsub" logo anywhere to return.

## Driving it with Playwright

- Open `/` and wait for cards: `await page.goto(t.BASE + '/', { waitUntil: 'domcontentloaded' }); await page.locator('a[href^="/phim/"]').first().waitFor({ timeout: 120000 })`. Observable: at least one card; `await page.locator('a[href^="/phim/"]').count()` is above 0.
- Prove the extension is active (not the "needs extension" screen): cards exist and `await page.locator('text=/AnimeVsub Helper/i').count()` is 0.
- Open the drawer: `await t.step('Open the menu', () => page.getByRole('button', { name: 'menu' }).click())`. Observable: drawer entries appear (`t.snap('drawer')`, read the file).
- Go to a card: `await t.step('Open first anime', () => page.locator('a[href^="/phim/"]').first().click())`. Observable: `page.url()` matches `/phim/`.
- Logo returns home: `await page.getByRole('link', { name: /nimeVsub/ }).click()`. Observable: `new URL(page.url()).pathname === '/'`.

## Gotchas

- The hero slider auto-advances: do not assert which card is first twice.
- `getByRole('button', { name: 'menu' })` is the Quasar icon button (its accessible name is the Material icon ligature "menu"); the first snapshot confirms it.
- Header is transparent on `/`, so screenshots look different from other pages.
