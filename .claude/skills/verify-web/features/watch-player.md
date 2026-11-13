# Watch page and player

The full-screen player for a title: video, controls, episode and season panels, speed panel, next-episode card, elapsed and total time. Route `/watch/<slug>/<episodeId?>`. The stream is the real one, fetched through the extension.

## Sub-features

- Autoplay, play and pause, back and forward 10s, seek bar (`player:seek`), mute and volume.
- Speed panel: 0.5, 0.75, 1, 1.25, 1.5, 2 (`speed:<rate>`).
- Episode panel: rows expand to show a play button. Switching changes the URL to `/watch/<slug>/<episodeId>`.
- Next-episode card (`player:next`, `player:next-card`), skip intro or outro (`player:skip`, needs skip data from `apps/api`).
- Fullscreen (`player:fullscreen`), error and retry (`player:error`, `player:retry`), loading overlay.

## How to get to it (user POV)

- Direct link: `/watch/<slug>`. Take the slug from the first `shelf:new-episodes` card on the live home page (`card:/phim/<slug>/`).
- From a card, once the details flow links there (cards currently go to the placeholder `/title/$`, see `home.md`).

## Driving it with Playwright

Proved end to end by `../scripts/watch-player.mjs`: `EV=$(cat apps/web/artifacts/verify-web/latest) node .claude/skills/verify-web/scripts/watch-player.mjs`.

- Autoplay: wait for `video.currentTime > 1.5` on `player:video`. Observable: `paused === false`. Do **not** click play first, it pauses.
- Pause: `r.click(page.getByTestId('player:play'), ...)`. Observable: `video.paused === true` and `currentTime` unchanged after 1.5s.
- Play: `r.click(page.getByTestId('player:play'), ...)` again. Observable: `currentTime` grows by 1.5s.
- Speed: `r.click(page.getByTestId('player:speed'), ...)` then `r.click(page.getByTestId('speed:2'), ...)`. Observable: `video.playbackRate === 2`.
- Health: `player:error` count is 0, and no response with status 400 or above from a host other than `:3100`.
- Switch episode (not scripted): `player:episodes`, `episode:2:toggle`, `episode:2:play`. Observable: the path becomes `/watch/<slug>/<id>`. Needs a title with 2 or more episodes.
- Title block at the top (`player:title`, `player:episode-label`, `player:episode-name`) follows the idle fade.
- Timeline: hover `player:seek`, the tooltip is `player:scrub-caption` (time, plus " · Mở đầu" or " · Kết thúc" over a skip segment) and `player:tick` marks the segment edges. `player:time` reads "elapsed / total".
- Other handles: `player:back10`, `player:forward10`, `player:mute`, `player:volume`, `player:seek`, `player:fullscreen`, `player:back`, `episode:now-playing`, `season:<slug>` in `player:seasons-panel`.

## Gotchas

- **Headless fails**: the stream host answers 403 and `player:error` shows ("Không phát được tập này"). Use the headed profile, which `rec.mjs` does.
- The first buffered second takes a few seconds (seen ~1.5s to start, 37s buffered).
- Controls hide when idle. Move the mouse or click a control before asserting they are visible.
- `player:skip` and `player:next` depend on API skip times and position. Map them only with a stubbed `page.route` for that request, and say it was mocked.
- Fullscreen in a recorded clip is unreliable. Skip it.
