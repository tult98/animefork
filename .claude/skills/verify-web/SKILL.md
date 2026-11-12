---
name: verify-web
description: Launch, health-check and drive web (apps/web, the React 19 + Vite rebuild of AnimeVsub) in a real Chrome with the AnimeVsub Helper extension loaded, against the live upstream site, the way a user does, and capture evidence. Use when verifying a change in apps/web works in the real app, reproducing a bug, or before recording evidence. Read features/ for the recipe per feature.
---

# verify-web

`apps/web` is the rebuilt AnimeVsub front end (React 19, Vite, TanStack Router and Query, Tailwind 4), dev server on port **5180** (fixed in `apps/web/vite.config.ts`). It fetches the upstream anime site (`https://animevietsub.best`) through the **AnimeVsub Helper** extension, which adds the site's cookies. So this skill has **one mode**: a headed Chrome for Testing with the built extension loaded, hitting the **live site**. There is no fixture or replay mode here, so never add `?transport=replay`.

Because data is live, assert on structure and on what the script clicked, never on a fixed title or count. Titles, ids and counts change daily.

Surface: web UI. Others: `apps/api` on port 3100 (art lookup, accounts), not driven here. Not covered: the extension's own UI, signed-in flows (see `features/README.md`).

Paths are relative to the repo root (`REPO=$(git rev-parse --show-toplevel)`).

## Why this harness

Playwright (`@playwright/test` 1.64.1 is a repo devDependency). `scripts/rec.mjs` loads `playwright-core` from `apps/web` and launches a **persistent context** with `--load-extension`. Branded Chrome ignores that flag, so it uses Chrome for Testing.

**Headed only.** Headless loads the extension and the pages, but the stream host (`stream.googleapiscdn.com`) answers 403 and the player shows its error screen. A Chrome window opens on the machine for the length of a run. Do not click in it, and tell the user before running.

Requests from the developer's own machine have passed with no Cloudflare challenge. If a page shows a challenge or answers 403, **stop and report it as SKIPPED**. A human solves it once in the headed window, the cookie then stays in the profile. Never try to get around it.

## Variables

| name              | default                  | meaning                            |
| ----------------- | ------------------------ | ---------------------------------- |
| `VERIFY_WEB_PORT` | `5180`                   | port Doctor and the scripts expect |
| `VERIFY_WEB_URL`  | `http://localhost:$PORT` | base URL the scripts drive         |
| `EV`              | set by Launch            | evidence dir, read by every script |

## Prerequisites

- `pnpm install` at the repo root. Node 22+.
- The extension built at `apps/extension/dist/chrome-mv3/manifest.json` (git-ignored output). If missing: `pnpm nx build extension-animevsub-helper`, and say you did.
- Browsers for the repo's Playwright version: `cd apps/web && pnpm exec playwright install chromium ffmpeg`. Recording throws "Video rendering requires ffmpeg" without the ffmpeg one. **Warning:** `playwright install` deletes every cached browser build that does not match this repo's Playwright version from `~/Library/Caches/ms-playwright`, which breaks other projects until they reinstall. Run it only when `ls ~/Library/Caches/ms-playwright` lacks `chromium-<n>` or `ffmpeg-<n>`.
- `ffprobe` on PATH (pacing check).
- `apps/web/.env.local` (git-ignored) has `VITE_API_URL=http://localhost:3100`. Leave it as the developer has it. With nothing on 3100 the art lookup fails quietly and cards fall back to source images.

## Evidence dir

`apps/web/artifacts/` is git-ignored (verified with `git check-ignore`). Per run: `EV=$REPO/apps/web/artifacts/verify-web/$(date +%Y%m%d-%H%M%S)`. Do not use `apps/web/artifacts/verify/`, `nx verify web` rewrites it. Layout: `app.log`, `server.pid` (only if this run started the server), `shots/`, `video/<scenario>.webm`, `clips.md`, `<scenario>.console.log`. Launch stores the path in `apps/web/artifacts/verify-web/latest`.

The browser profile is `apps/web/artifacts/verify-web/ext-profile/`. It holds cookies and is git-ignored. Never commit or print it.

## Launch

One block. It reuses a server only when its working directory is this repo and stops on anything else.

```bash
REPO=$(git rev-parse --show-toplevel); PORT=${VERIFY_WEB_PORT:-5180}
ROOT=$REPO/apps/web/artifacts/verify-web; EV=$ROOT/$(date +%Y%m%d-%H%M%S); mkdir -p "$EV" && echo "$EV" > "$ROOT/latest"
PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t | head -1)
if [ -n "$PID" ]; then
  CWD=$(lsof -a -p $PID -d cwd -Fn | sed -n 's/^n//p')
  case "$CWD" in
    "$REPO"|"$REPO"/*) echo "port $PORT: reusing dev server pid $PID (NOT ours, do not stop it)" ;;
    *) echo "STOP: port $PORT is held by pid $PID in $CWD (not this repo). Report it, do not kill it."; false ;;
  esac
else
  (cd "$REPO" && nohup pnpm nx dev web > "$EV/app.log" 2>&1 & echo $! > "$EV/server.pid")
  echo "started wrapper pid $(cat "$EV/server.pid")"
fi
```

On STOP, stop and report. The port is fixed. A second `pnpm nx dev web` next to a running one hangs on "Waiting for web:dev in another nx process", so never start one beside another. Then wait:

```bash
for i in $(seq 60); do curl -sf localhost:${VERIFY_WEB_PORT:-5180}/ | grep -q '<title>animefork</title>' && echo ready && break; sleep 2; done
```

**Usable** means the home page shows live shelves through `ExtensionTransport`. The first scenario passing proves that. First compile of a route takes seconds, so every script loads its page once and reloads before recording.

## Doctor

Read-only. Run first and whenever anything looks off.

```bash
REPO=$(git rev-parse --show-toplevel); PORT=${VERIFY_WEB_PORT:-5180}; URL=${VERIFY_WEB_URL:-http://localhost:$PORT}
PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t | head -1); [ -n "$PID" ] || { echo "FAIL nothing on $PORT"; exit 1; }
CWD=$(lsof -a -p $PID -d cwd -Fn | sed -n 's/^n//p'); case "$CWD" in "$REPO"*) echo "ok  port $PORT served from $CWD";; *) echo "FAIL port $PORT served from $CWD"; exit 1;; esac
curl -sf "$URL/" | grep -q '<title>animefork</title>' && echo "ok  serves apps/web" || echo "FAIL not this app"
[ -f "$REPO/apps/extension/dist/chrome-mv3/manifest.json" ] && echo "ok  extension built" || echo "FAIL extension not built: pnpm nx build extension-animevsub-helper"
pgrep -f "verify-web/ext-profile" >/dev/null && echo "FAIL a Chrome already holds the profile (another run?). Do not kill it." || echo "ok  profile free"
ls ~/Library/Caches/ms-playwright | grep -q '^chromium-' && ls ~/Library/Caches/ms-playwright | grep -q '^ffmpeg-' && echo "ok  playwright browsers" || echo "FAIL browsers: see Prerequisites"
command -v ffprobe >/dev/null && echo "ok  ffprobe" || echo "FAIL ffprobe"
```

The real readiness proof is `scripts/home-live.mjs` passing: it asserts `window.__app.transport` is `ExtensionTransport` and that all 5 shelves have cards.

## Auth

Browsing, listings and watching need **no sign-in**, so no credentials are set. Sign-in, sign-up and verify-email talk to `apps/api` and need a database and mail, so they are *not yet mapped*. When mapped, use `VERIFY_WEB_EMAIL` and `VERIFY_WEB_PASSWORD` set in the developer's shell, never written here. If missing, ask the user. The 401 console errors on every page are the session probe answering "signed out", not a failure.

## Drive

Each scenario is one script, one run of the persistent profile, one recorded page. Run:

```bash
EV=$(cat apps/web/artifacts/verify-web/latest) node .claude/skills/verify-web/scripts/<scenario>.mjs
```

Exit 0 means every check passed and the clip is paced. Scenarios: `home-live`, `listing-sort-page`, `watch-player`. To write a new one copy `scripts/listing-sort-page.mjs`: `start(name, { ev, actions, proves })`, then `r.title()`, `r.click(locator, 'label')`, `r.type(locator, value, 'label')`, `r.check(name, bool)`, `r.shot(name)`, `r.url(path)`, `r.finish()`.

Handles: `data-testid` first (listed per feature), ARIA roles second, never coordinates. Dev-only hook `window.__app` (`route()`, `queryKeys()`, `shelves()`, `transport`) is for reading state, never for causing it.

Rules a proof run taught:

- **The real player autoplays.** Clicking `player:play` right after load pauses it. Wait for `currentTime > 1.5` first, then pause, then play.
- An "is it visible" read that does not wait must follow a wait for either outcome. Listing sort and pager are **disabled** until every season page loaded: wait for `[data-testid="listing:sort"]:not([disabled])`.
- "Has not happened yet" is one read taken while the request is in flight, never a polling wait.
- Pick a title from the live home page (first card of `shelf:new-episodes`) instead of hard-coding a slug, because slugs rotate.
- Mock by intercepting on the page (`page.route`) before the action, delay the mocked response to hold a loading state, and say in the proof that it was mocked.
- Episode rows expand first: click `episode:<n>:toggle`, then `episode:<n>:play` exists. A title may have only one episode.
- Collect failing upstream responses with `page.on('response')` and assert none. Ignore the `:3100` API host.

## Evidence

Per scenario: a screenshot before and after the action, the clip, `<scenario>.console.log`, and the state read that proves it (URL, `currentTime`, `playbackRate`, counter text). Proof standards:

- Exercise the real user path: click and type in the UI, never `window.__app` setters, URL hacks that skip the control, or test-only endpoints. Starting at `/watch/<slug>` is a real entry point (a link).
- Capture the action and the resulting state.
- Verify side effects: search params, the video element's state, failing network responses.
- Nothing is mocked in the shipped scenarios. Anything you mock, say so.
- Data is live and the machine's IP is the client. A failure can be the upstream's, so check the `HTTP` status lines before blaming the change.

## Record

- Recorder: `recordVideo: { dir, size }` on the persistent context, set up by `start()`. `finish()` waits `FINAL_HOLD`, runs `context.close()` (a clip is only complete once the page closes), moves the file to `<EV>/video/<scenario>.webm`, and appends `- video/<scenario>.webm | <proves> | PASS|FAIL` to `<EV>/clips.md` **after** the checks ran. A scenario with no checks is FAIL.
- Pacing values live in `PACE` at the top of `scripts/rec.mjs`: `PAUSE_BEFORE` 1000, `PAUSE_AFTER` 1000, `TYPE_DELAY` 120 per keystroke, `TITLE_HOLD` 1500, `FINAL_HOLD` 2000, `MIN_SEC_PER_ACTION` 2. A reviewer can speed a clip up but not slow it down, so choose slow.
- Each action pauses before (an overlay labels it), acts, pauses after. The overlay is `pointer-events: none` and built only from literals in the script. Never put page content or API text in it. The clip opens with the scenario title and the final state is held 2s.
- A clip is as long as the script's browser time, so agent thinking time is never recorded. Dead air is the app's own (a first compile, live fetches). Each script loads the route once and reloads before `r.title()` to skip the compile.
- Pacing self-check runs in `finish()`: `ffprobe` duration divided by the declared `actions`, against `MIN_SEC_PER_ACTION`. It prints `TOO FAST` and exits 1 when under. Declare `actions` honestly (count `click` and `type` calls), raise `PAUSE_*`, re-record. By hand: `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 <clip>`.
- Screenshots stay beside the clip, because a clip shows the UI and not the traffic.

## Cleanup

- `finish()` closes the context, which closes the headed Chrome. If a script crashed, look for a Chrome still holding the profile with `pgrep -fl "verify-web/ext-profile"`, and stop only a pid you can tie to this run.
- This app writes nothing server-side when signed out, so there are no records to delete.
- Stop the dev server **only if Launch started it** (`$EV/server.pid` exists). It is a pnpm → nx → vite tree, so stop the tree by the recorded pid:

```bash
EV=$(cat apps/web/artifacts/verify-web/latest)
if [ -f "$EV/server.pid" ]; then
  kill_tree() { for c in $(pgrep -P "$1"); do kill_tree "$c"; done; kill "$1" 2>/dev/null; }
  kill_tree "$(cat "$EV/server.pid")"; sleep 2
  lsof -nP -iTCP:${VERIFY_WEB_PORT:-5180} -sTCP:LISTEN -t && echo "port still held" || echo "port free"
fi
```

- Never `pkill` by name, never close other browsers, never stop a server this run did not start. Cleanup never touches `$EV` or the profile.

## Helpers

- `scripts/rec.mjs`: library, not run directly. Launches the extension Chrome, overlay, recorder, pacing check.
- `scripts/home-live.mjs`, `scripts/listing-sort-page.mjs`, `scripts/watch-player.mjs`: scenarios, invoked as in Drive.
