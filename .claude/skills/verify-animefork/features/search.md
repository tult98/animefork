# Search

The top-bar search box takes a keyword; Enter (or the magnifier) goes to `/tim-kiem/<keyword>` and lists matching anime as cards. Typing also opens a suggestion dropdown.

## Sub-features

- Keyword search to `/tim-kiem/<keyword>`
- Suggestion dropdown while typing (`src/components/app/search-bar.vue`, uses `apis/runs/pre-search.ts`)
- Result cards linking to `/phim/<slug>/`

## How to get to it (user POV)

Click the search box in the top bar, type, press Enter.

## Driving it with Playwright

Proved end to end (this is the recorded proof scenario).

- Focus and type: `const box = page.getByPlaceholder('Search'); await t.step('Type the query', () => t.type(box, 'one piece'))`. Observable: the box holds `one piece` (`await box.inputValue()`).
- Submit: `await t.step('Press Enter', async () => { await page.keyboard.press('Enter'); await page.waitForURL(/\/tim-kiem\/one%20piece/) })`. Observable: URL is `/tim-kiem/one%20piece`.
- Results: `await page.locator('a[href^="/phim/one-piece"]').first().waitFor({ timeout: 60000 })`. Observable: `count() > 0`; a normal run lists ~30 One Piece cards. `t.snap('after')` + `t.shot('after')` for evidence.
- Open a result: `await t.step('Open first result', () => page.locator('a[href^="/phim/one-piece"]').first().click())`. Observable: URL starts with `/phim/one-piece`.
- Empty/odd keyword (journey to add when needed): type `zzzzqqqq`, Enter. Observable: zero `a[href^="/phim/"]` cards and an empty-state, not an error toast; report what the app really shows.

## Gotchas

- Run `page.goto(BASE + '/')` and wait for cards first, so the search box exists and the route compile is behind you.
- Result count depends on upstream data; assert `> 0` and the keyword in `href`, not an exact number.
- The query is URL-encoded (`one%20piece`).
