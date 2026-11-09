# Rankings

`/bang-xep-hang/<type>` ranks anime by popularity: tabs Default, Day, Month, Year, Evaluate, Season, with ~40 ranked cards each.

## Sub-features

- Tabs/links: `/bang-xep-hang/` (Default), `day`, `month`, `year`, `voted` (Evaluate), `season`
- Ranked card list with title, latest episode, alt names

## How to get to it (user POV)

Left drawer entry for rankings, or open `/bang-xep-hang/day`.

## Driving it with Playwright

- Open: `await page.goto(t.BASE + '/bang-xep-hang/day', { waitUntil: 'domcontentloaded' }); await page.locator('a[href^="/phim/"]').first().waitFor({ timeout: 90000 })`. Observable: heading `Anime Rankings by Day`, about 40 cards (`count()`).
- Switch tab: `await t.step('Open the Month ranking', async () => { await page.getByRole('link', { name: 'Month', exact: true }).click(); await page.waitForURL(/bang-xep-hang\/month/) })`. Observable: URL `/bang-xep-hang/month` and the heading changes; cards re-render (`count() > 0`).
- Repeat for `Year`, `Evaluate` (URL `voted`), `Season`.
- Open a ranked item: click the first card; URL matches `/phim/`.

## Gotchas

- The top item can be the same on several tabs (a long-running series): assert URL and heading, not that the first card changed.
- Tab names are links (`role=link`), not `.q-tab`.
- Ranking content is live; do not hardcode titles.
