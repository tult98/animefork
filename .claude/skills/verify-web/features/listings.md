# Listings

Full-season and upcoming lists with a sort dropdown, a 30-per-page pager, and sort and page kept in the URL. `/airing-this-season` lists the jp titles of the current season. `/upcoming` lists upcoming anime with a countdown tag.

## Sub-features

- Sort: `recent` (default), `rating-desc`, `rating-asc`, `views-desc`. Changing it resets the page and replaces the history entry.
- Pager: hidden at one page, `Trang X / N` below 768px, ellipses above 7 pages.
- Partial load notice (`listing:partial`) when a later season page failed.
- Count header (`listing:count`, seen `Mùa thu 2026 · 60 phim`).

## How to get to it (user POV)

- Home, airing shelf, "Xem tất cả" (`shelf:airing-this-season:see-all`), goes to `/airing-this-season`.
- Home, upcoming shelf, its see-all link, goes to `/upcoming`. Open `/upcoming` directly as the second entry point.
- Direct link with state: `/airing-this-season?sort=views-desc&page=2`.

## Driving it with Playwright

Proved end to end by `../scripts/listing-sort-page.mjs`: `EV=$(cat apps/web/artifacts/verify-web/latest) node .claude/skills/verify-web/scripts/listing-sort-page.mjs`.

- Ready: `page.waitForSelector('[data-testid="listing:sort"]:not([disabled])', { timeout: 60000 })`. Observable: `listing:count` matches `/\d+ phim/`.
- Open sort: `r.click(page.getByTestId('listing:sort'), ...)`. Observable: `listing:sort:option:views-desc` visible.
- Pick sort: `r.click(page.getByTestId('listing:sort:option:views-desc'), ...)`. Observable: `location.search` has `sort=views-desc` and the first grid card (`[data-testid="listing:grid"] [data-testid^="card:/"]`) differs from before.
- Next page: `r.click(page.getByTestId('listing:next'), ...)`. Observable: `location.search` has `page=2`, the grid still has cards, and the page scrolls to the grid.
- Upcoming variant (not scripted): same handles on `/upcoming`, default sort is the site's own order, cards carry a countdown tag.

## Gotchas

- Sort and pager stay disabled until every season page has loaded. The live list loads page by page, so use a 60s timeout.
- With 30 titles or fewer there is no pager and the script logs `no pager` and skips that step.
- The rating sorts use MAL data from the API when it answers, so the order can change mid-run. `views-desc` is stable, which is why the script uses it.
- Use the `listing:sort:option:<value>` handle, never the Vietnamese label.
