# Watch page and player

The full-screen player for a title: video, controls, episode and season panels, speed panel, next-episode card, elapsed and total time. Route `/watch/<slug>/<episodeId?>`. The stream is the real one, fetched through the extension.

## Sub-features

- Autoplay, play and pause, back and forward 10s, seek bar (`player:seek`), mute and volume.
- Speed panel: 0.5, 0.75, 1, 1.25, 1.5, 2 (`speed:<rate>`).
- Episode panel: each row is one button (`episode:<n>`, thumbnail, "Tập N · Đang phát/Đã xem", name), and clicking it switches the URL to `/watch/<slug>/<episodeId>`. The current row has the equaliser (`episode:now-playing`). The close button is `player:episodes-close`. With several seasons the header has the season pill `player:seasons`, which opens the seasons view (`player:seasons-panel`, back button `player:seasons-back`).
- Next-episode popover (`player:next`, `player:next-card`), skip intro, skip outro or the outro next-episode card (`player:skip`, `player:outro-card`, needs skip data from `apps/api`).
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
- Long episode list: `../scripts/watch-episodes-scroll.mjs` opens One Piece (override with `SLUG`), checks the panel renders 50 rows, 100 and 150 after two scrolls of `.pl-scroll`, that `GET :3100/v1/episodes/<slug>?from=101` is sent only once rows pass 100, and that episode 150 is named in the panel and the player. Needs `apps/api` on :3100 with that title's MAL episodes.
- Panel opens at the playing episode: `../scripts/watch-episodes-anchor.mjs` plays One Piece episode 150 by URL, checks its row (`aria-current="true"`) is inside the `.pl-scroll` viewport with rows from 145, then scrolls to the top three times and checks earlier rows appear down to episode 1 while the previous first row stays within 2px on screen. It sets `overflow-anchor: none` on `.pl-scroll` so Chrome's own scroll anchoring cannot hide a broken fix.
- Switch episode (not scripted): hover `player:episodes`, then click `episode:2`. Observable: the path becomes `/watch/<slug>/<id>`. Needs a title with 2 or more episodes.
- Title block at the top (`player:title`, `player:episode-label`, `player:episode-name`) follows the idle fade.
- Timeline: hover `player:seek`, the tooltip is `player:scrub-caption` (time, plus " · Mở đầu" or " · Kết thúc" over a skip segment) and `player:tick` marks the segment edges. `player:time` reads "elapsed / total".
- Skip: the intro shows a white pill `player:skip` (`data-kind=intro`). In an outro with a next episode, the card `player:outro-card` shows instead ("Phát sau N giây", button `player:skip` "Phát ngay") and the hover popover `player:next-card` is not rendered. With no next episode, `player:skip` is the plain "Bỏ qua phần kết" pill.
- Autoplay next: when the video ends and a next episode exists, the player calls `onNext` once and the URL becomes `/watch/<slug>/<nextId>`. Observable: seek to `duration - 4` on a non-last episode and wait for the path to change. The last episode stays on `ended`.
- Other handles: `player:back10`, `player:forward10`, `player:mute`, `player:volume`, `player:seek`, `player:fullscreen`, `player:back`, `season:<slug>` in `player:seasons-panel`.

## Gotchas

- **Headless fails**: the stream host answers 403 and `player:error` shows ("Không phát được tập này"). Use the headed profile, which `rec.mjs` does.
- The first buffered second takes a few seconds (seen ~1.5s to start, 37s buffered).
- Controls hide when idle. Move the mouse or click a control before asserting they are visible.
- `player:skip` and `player:next` depend on API skip times and position. Map them only with a stubbed `page.route` for that request, and say it was mocked.
- Fullscreen in a recorded clip is unreliable. Skip it.
