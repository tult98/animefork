---
name: verify-animefork
description: Launch, health-check and drive AnimeVsub (apps/desktop-web, a Quasar/Vue web app that needs the AnimeVsub Helper browser extension) the way a user does, and capture evidence. Use when verifying a change in the AnimeVsub web app works in the real app, reproducing a bug, or before recording evidence. Read features/ for the recipe per feature.
---

# verify-animefork

AnimeVsub is a Vue 3 + Quasar (Vite) web app in `apps/desktop-web`, dev server on port **9000**. It has no backend of its own: every request to the anime site goes through the **AnimeVsub Helper** browser extension (source in `apps/extension`). Without that extension the app only shows a "needs extension" screen. So the driver must be a real Chromium with the built extension loaded, and the data on screen is **live data from the upstream anime site**: titles change day to day, so assert on structure and on the thing the test typed or clicked, never on a fixed title list.

Surface: web UI (primary). Not covered: the Chrome extension UI itself, the PWA build, Firebase/Supabase sync.

Paths below are relative to the repo root (`REPO=$(git rev-parse --show-toplevel)`). Everything this skill needs is in this folder; `features/README.md` is the index of per-feature recipes.

## Variables

| name | default | meaning |
|---|---|---|
| `VERIFY_ANIMEVSUB_PORT` | `9000` | dev server port the Launch step uses |
| `VERIFY_ANIMEVSUB_URL` | `http://localhost:$PORT` | base URL the scripts drive (read by `scripts/pw.cjs`) |
| `PW` | auto | optional path to a `playwright-core` package |
| `CHROME` | auto | optional path to a Chromium binary |

## Evidence dir

One per run: `EV=${TMPDIR:-/tmp}/verify-animefork/$(date +%Y%m%d-%H%M%S)`. It is outside the repo so it can never be committed (it holds browser profiles). Launch creates it and stores its path in `${TMPDIR:-/tmp}/verify-animefork/latest`, so any later shell can re-read it with `EV=$(cat ${TMPDIR:-/tmp}/verify-animefork/latest)`. Layout: `app.log`, `server.pid` (only if this run started the server), `shots/`, `video/<scenario>.webm`, `clips.md`, `<scenario>.console.log`.

## Launch

Run as one block. It reuses a dev server only when that server's working directory is this repo, and refuses to touch anything else.

```bash
REPO=$(git rev-parse --show-toplevel); PORT=${VERIFY_ANIMEVSUB_PORT:-9000}
ROOT=${TMPDIR:-/tmp}/verify-animefork; EV=$ROOT/$(date +%Y%m%d-%H%M%S); mkdir -p "$EV" && echo "$EV" > "$ROOT/latest"
PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t | head -1)
if [ -n "$PID" ]; then
  CWD=$(lsof -a -p $PID -d cwd -Fn | sed -n 's/^n//p')
  case "$CWD" in
    "$REPO"|"$REPO"/*) echo "port $PORT: reusing dev server pid $PID (NOT ours, do not stop it)" ;;
    *) echo "STOP: port $PORT is held by pid $PID running in $CWD (not this repo). Report it; do not kill it. Retry with VERIFY_ANIMEVSUB_PORT=<free port>."; false ;;
  esac
else
  (cd "$REPO" && nohup pnpm nx run animefork:dev -- --port $PORT > "$EV/app.log" 2>&1 & echo $! > "$EV/server.pid")
  echo "started dev server wrapper pid $(cat "$EV/server.pid") on port $PORT"
fi
```

If the block printed STOP, stop and report. Otherwise wait until Vite answers (first start of a cold cache can take a minute):

```bash
PORT=${VERIFY_ANIMEVSUB_PORT:-9000}
for i in $(seq 60); do curl -sf localhost:$PORT/ | grep -q '<title>AnimeVsub' && echo ready && break; sleep 2; done
```

"Answers" is only half of usable. **Usable** means the home page shows anime cards with the extension loaded: Doctor's last check proves that. Prerequisites a fresh clone needs (none are started by this skill):

- `pnpm install` at the repo root, Node 22+ (the repo runs with Node 25).
- `apps/desktop-web/.env` (git-ignored; copy `.env.example`). The blank Firebase/Supabase values only produce console noise (see Gotchas); the app browses anonymously without them.
- The extension must be built at `apps/extension/manifest-v3/extension/` (it contains `manifest.json` and `dist/`; git-ignored build output). If missing, build it per `apps/extension/package.json` (`build` script, needs `bun`) and report that you did.
- Playwright: `playwright-core` plus a Chromium from Playwright's cache (`@playwright/cli` global install provides both: `npm i -g @playwright/cli`, then its install-browser command). `ffmpeg`/`ffprobe` on PATH for the clip pacing check.

## Doctor

Read-only. Run first and whenever something looks off. Every line must say OK.

```bash
REPO=$(git rev-parse --show-toplevel); PORT=${VERIFY_ANIMEVSUB_PORT:-9000}; ROOT=${TMPDIR:-/tmp}/verify-animefork
PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t | head -1); CWD=$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
case "$CWD" in "$REPO"/*) echo "OK port $PORT served from $CWD";; *) echo "FAIL port $PORT: pid '$PID' cwd '$CWD'";; esac
curl -sf localhost:$PORT/ | grep -q '<title>AnimeVsub' && echo "OK serves AnimeVsub" || echo "FAIL page is not AnimeVsub"
[ -f "$REPO/apps/extension/manifest-v3/extension/manifest.json" ] && echo "OK helper extension built" || echo "FAIL extension not built"
node -e 'const p=require(process.argv[1]+"/scripts/pw.cjs");p.playwrightCore();console.log("OK playwright-core, chromium at",p.chromePath())' "$REPO/.claude/skills/verify-animefork" 2>&1 | tail -1
command -v ffprobe >/dev/null && echo "OK ffprobe" || echo "FAIL ffprobe missing"
```

The `node -e` line resolves playwright-core and the Chromium binary. The real "usable" check is the first scenario's wait for anime cards (`a[href^="/phim/"]`, 120 s on a cold start): if the cards never appear, the page is showing the extension screen or the upstream site is down. Say so, with `$EV/<scenario>.console.log` and a screenshot.

## Auth

Not needed for anonymous browsing, which covers every mapped feature. Account features (follow, history, notification, sync) need a login on the real upstream site through the app's "Log in" dialog (email + password fields, submit button "Log in"). The repo has no test credentials. If a journey needs login:

- Variables: `VERIFY_ANIMEVSUB_EMAIL`, `VERIFY_ANIMEVSUB_PASSWORD`. A developer sets them in their own shell. Never print, log, or save them in this skill.
- Check presence only: `[ -n "$VERIFY_ANIMEVSUB_EMAIL" ] && [ -n "$VERIFY_ANIMEVSUB_PASSWORD" ] && echo set || echo missing`.
- Missing means ask the user. Do not create an account and do not guess.
- Login posts to the real site, so it affects a real account. Use only an account the user gave you for this.

## Drive

Harness: **Playwright (playwright-core) driving Chromium with the AnimeVsub Helper extension**. The repo has no e2e framework of its own (only vitest unit tests), so this is the lightest generic tool already on the machine. A plain headless browser cannot work because the app refuses to render without the extension. Extensions load under `--headless=new`, which `scripts/pw.cjs` sets up, so no window pops up.

`scripts/pw.cjs` gives every scenario its own fresh profile (`$EV/profile-<scenario>`), its own page and its own video, so it never touches the developer's browser or another agent's. Use it from a one-off script written to `$EV` or the scratchpad:

```js
const pw = require('<REPO>/.claude/skills/verify-animefork/scripts/pw.cjs')
const t = await pw.open({ runDir: process.env.EV, scenario: 'my-scenario' })   // t.page is a Playwright Page
await t.page.goto(t.BASE + '/', { waitUntil: 'domcontentloaded' })
await t.step('label shown on screen', () => t.page.getByRole('link', { name: 'Day' }).click())
await t.close({ pass: true, proves: 'what this scenario proves' })              // finishes the clip, writes clips.md, pacing check
```

Run scripts with `EV=$(cat ${TMPDIR:-/tmp}/verify-animefork/latest) VERIFY_ANIMEVSUB_URL=http://localhost:${VERIFY_ANIMEVSUB_PORT:-9000} node script.cjs`. Helper API: `t.step(label, fn)` (label, pause, act, pause; counts as one action), `t.type(locator, text)`, `t.say(label)`, `t.snap(name)` (accessibility snapshot to `shots/`), `t.shot(name)` (PNG to `shots/`), `t.consoleLog`, `t.close({pass, proves})`.

Handles (the app has no `data-test-id`; use these): search box `getByPlaceholder('Search')` (UI language is English by default, so text locators are English; check `getByRole`/text first if the UI is Vietnamese), anime cards `a[href^="/phim/"]`, episode picker text `Select episode`, ranking tabs `getByRole('link', { name: 'Month', exact: true })`, routes in `apps/desktop-web/src/router/routes.ts`.

Rules the proof runs taught:

- The first load after a dev-server start compiles every route on demand. Wait for the specific element (`.waitFor({ timeout: 120000 })`), never `waitForTimeout`, and load the page once before recording so the compile is not in the clip.
- "Is it visible" reads that do not wait lie. Wait for either outcome (cards or the extension screen text) before branching on an optional element.
- "Has not happened yet" is one read taken while the request is in flight, not a polling loop: a poll that outlasts the request sees the later, legitimate state.
- Mock by intercepting on the page before the action (`page.route(...)`) and delay the mocked response when a loading state must stay on screen. The extension's own network is not visible to `page.on('request')` (it goes through the extension's background worker), so API-level mocking is not available for the upstream site: assert on what the page renders.
- Toasts are `.q-notification`; read them right after the action (they disappear after a few seconds).
- Live data: never assert a specific title unless the test itself searched for it.

## Evidence

Per scenario, capture before and after, not only the final screen:

- `t.snap('before')` / `t.snap('after')` accessibility snapshots, `t.shot('after')` screenshot, `$EV/<scenario>.console.log` (auto-written: console errors/warnings and page errors).
- The side effect that proves the action: the URL (`page.url()`), the count and `href`s of cards, the toast text. The upstream request is made by the extension, so the rendered result is the observable.
- Standards: drive the real user path (click, type, Enter), not router pushes or query-string hacks; mock only what the environment cannot reach and say in the proof that it was mocked; if a mode skips work, observe what it actually skips.

## Record

`scripts/pw.cjs` already wires recording: each `pw.open` creates a browser context with `recordVideo` (1280x800), and `t.close()` closes the page (a clip is only complete once its page closes), saves `$EV/video/<scenario>.webm`, removes the raw dir, appends `- video/<scenario>.webm | <proves> | PASS|FAIL` to `$EV/clips.md`, and runs the pacing self-check. Call `close` after the scenario's checks ran so a failing scenario is never listed as PASS. One script per scenario; one scenario per clip; screenshots and snapshots stay alongside since a clip shows only the UI.

Pacing is the `PACE` object at the top of `scripts/pw.cjs`, tune per repo:

| name | value | rule |
|---|---|---|
| `PAUSE_BEFORE` | 1000 ms | pause before every action so the viewer sees the target |
| `PAUSE_AFTER` | 1000 ms | pause after so the result is visible |
| `TYPE_DELAY` | 120 ms | per keystroke (never snap a value in) |
| `FINAL_HOLD` | 2000 ms | hold the final state |
| `MIN_SEC_PER_ACTION` | 2 s | pacing self-check threshold |

Rules for a watchable clip: one script per scenario so no agent latency becomes frozen frames; start with `t.say('Scenario: …')`; label each step with `t.step` (the label overlay uses `pointer-events:none` and only literal text from the script, never page content or API text); hold transient states (toast, redirect) with an extra `page.waitForTimeout(2500)` until readable; choose the slowest comfortable pace. The self-check prints `PACING OK` or `PACING TOO FAST: <s>s for <n> actions`. Under `MIN_SEC_PER_ACTION` per action, or with dead air (long waits for the app), re-record with slower pacing. Confirm the clip is non-empty with `ls -l $EV/video` and `ffprobe -v error -show_entries format=duration -of csv=p=0 $EV/video/<scenario>.webm`. A clip's dead time is the app's own (first compile, upstream latency); warm the route first.

## Cleanup

Never touches `$EV`. Close what this run opened and nothing else.

```bash
ROOT=${TMPDIR:-/tmp}/verify-animefork; EV=$(cat "$ROOT/latest"); PORT=${VERIFY_ANIMEVSUB_PORT:-9000}
# 1. stray browsers launched by THIS run (matched by this run's profile dir; other browsers are never touched)
pkill -f "$EV/profile-" 2>/dev/null; true
# 2. dev server: only if Launch started it (server.pid exists). Kill that wrapper and its descendants.
if [ -f "$EV/server.pid" ]; then
  killtree() { for c in $(pgrep -P "$1"); do killtree "$c"; done; kill "$1" 2>/dev/null; }
  killtree "$(cat "$EV/server.pid")"; sleep 2
  lsof -nP -iTCP:$PORT -sTCP:LISTEN -t | grep -q . && echo "WARN port $PORT still busy" || echo "port $PORT free"
else
  echo "dev server was not started by this run; left running"
fi
```

The app writes nothing to the upstream site during anonymous browsing, so there are no records to delete. If an authenticated journey changed an account (follow, rating), undo it through the same UI before cleanup.

## Helpers

`scripts/pw.cjs` is a CommonJS module, not a command: `require` it as shown in Drive. It resolves playwright-core (env `PW`, else global `npm root -g`), picks the newest Chromium in Playwright's cache (env `CHROME` overrides), and loads the extension from `apps/extension/manifest-v3/extension`.

## Gotchas that are not bugs

- **Baseline console noise** on every page: `Failed to load resource ... 400` and `FirebaseError ... API key not valid` (blank Firebase config in `.env`), `[Vue Router warn] Alias "/phim/:season"...`. Treat any error beyond these as new.
- **Playback currently fails upstream**: opening an episode shows the toast `Play load error: Error: player page 403` and the `<video>` stays at `readyState 0` with the `DU` server. The player page (`stream.googleapiscdn.com/player/...`) answers 403 for this browser. That is the live state of the player path, not something this skill can fix; journeys that need actual video frames report it as blocked (see `features/watch-anime.md`).
- Search results and card counts vary with the upstream site's data.
