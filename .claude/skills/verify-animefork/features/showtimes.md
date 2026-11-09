# Showtimes

`/lich-chieu-phim` shows the weekly airing schedule: a row of weekday tabs (`T4 11/11`, `T5 12`, ... `CN`) and the anime airing on the selected day with its time, episode and description.

## Sub-features

- Weekday tab row (selected day highlighted, dates)
- Per-day list of airing anime linking to `/phim/<slug>/`
- Current-day default

## How to get to it (user POV)

Left drawer entry for the schedule, or open `/lich-chieu-phim`.

## Driving it with Playwright

- Open: `await page.goto(t.BASE + '/lich-chieu-phim', { waitUntil: 'domcontentloaded' }); await page.locator('a[href^="/phim/"]').first().waitFor({ timeout: 90000 })`. Observable: heading text `Showtimes`; at least one card.
- Switch day: `const before = await page.locator('a[href^="/phim/"]').evaluateAll(a => a.map(x => x.getAttribute('href'))); await t.step('Choose the next day', () => page.getByText('T5').first().click()); await page.waitForTimeout(3000)`. Observable: the list of hrefs differs from `before` (proved: 1 card on T4, a different list on T5).
- Open an item: `await t.step('Open first show', () => page.locator('a[href^="/phim/"]').first().click())`. Observable: URL matches `/phim/`.

## Gotchas

- Weekday labels are Vietnamese style (`T2`..`T7`, `CN`) even in the English UI, and depend on today's date: read them from `page.locator('.q-page').innerText()` instead of hardcoding which day exists.
- The day tabs are not Quasar `.q-tab` elements; click by text.
- A day can legitimately have few or zero items.
