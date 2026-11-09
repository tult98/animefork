# Watch an anime / episode page

`/phim/<slug>/` (series page) and `/phim/<slug>/tap-<NNN>-<id>` (episode) show the player, the "Select episode" panel grouped in ranges (001-050, ...), title, rating, tags, description, recommendations and comments.

## Sub-features

- Series page loads title, metadata, episode ranges
- Pick an episode (URL changes to `tap-<NNN>-<id>`)
- Player: play/pause, server picker (`DU`/`FB`), quality (`HQ`), speed, fullscreen
- Playback load error toast when the upstream player page refuses (current live behaviour)
- Skip back/forward, next episode, save/follow/share buttons (follow needs login)

## How to get to it (user POV)

From search, home or rankings click a card; or open `/phim/one-piece-dao-hai-tac-a1/` directly (a long-running series that stays listed).

## Driving it with Playwright

- Open series page: `await page.goto(t.BASE + '/phim/one-piece-dao-hai-tac-a1/', { waitUntil: 'domcontentloaded' }); await page.getByText('Select episode').waitFor({ timeout: 90000 })`. Observable: "Select episode" and episode numbers like `001` visible; title contains `One Piece`.
- Pick episode 2: `await t.step('Pick episode 002', () => page.locator('a:has-text("002")').first().click())`. Observable: `page.url()` matches `/tap-002-\d+`.
- Playback state: `const v = await page.locator('video').evaluate(v => ({ readyState: v.readyState, src: v.currentSrc, error: v.error && v.error.code }))`. Observable today: `readyState 0`, empty `src`; and the toast `await page.locator('.q-notification').allInnerTexts()` contains `Play load error: Error: player page 403`. Record this as the observed result.
- When the upstream player works again, the same read must show `readyState >= 3` and `currentTime` increasing after `await page.keyboard.press('Space')`; then pass. **Until then the "plays video" journey is BLOCKED**: report it as such, not as PASS.
- Server switch: click `DU` (bottom bar), choose the other server; observable: a new load attempt (toast or `video.src` change). Not driven yet.

## Gotchas

- Playback is the known-bad path: the player page request to `stream.googleapiscdn.com/player/...` returns 403 (see `../SKILL.md`). Recent repo work on the playlist cipher (`src/logic/avs-playlist.ts`, `src/apis/runs/ajax/player-link.ts`, `tools/avs-loader`) targets this area; re-check it here after those changes.
- The series page's first request goes through the extension: allow up to 90 s on a cold start.
- Episode URLs carry an id (`tap-002-36`): match with a regex, never a literal.
- "Follow", "Save to playlist" and rating need login: out of scope here.
