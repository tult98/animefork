// Recorder for verify-web. Import from a scenario script: import { start } from '<skill>/scripts/rec.mjs'
// One browser context + one page per scenario, so one scenario = one clip. No credentials are read here.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tunable pacing, ms unless noted. Raise them if the pacing self-check fails.
export const PACE = {
  PAUSE_BEFORE: 1000,
  PAUSE_AFTER: 1000,
  TYPE_DELAY: 120,
  TITLE_HOLD: 1500,
  FINAL_HOLD: 2000,
  MIN_SEC_PER_ACTION: 2,
};

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const BASE =
  process.env.VERIFY_WEB_URL ||
  `http://localhost:${process.env.VERIFY_WEB_PORT || 5180}`;
const { chromium } = createRequire(join(REPO, 'apps/web/package.json'))(
  'playwright-core',
);

// start(scenario, { ev, actions, proves }) -> { page, step, click, type, hold, finish }
// ev = evidence dir, actions = number of user actions the script performs (for the pacing check).
// Real AnimeVsub Helper extension loaded in a HEADED Chrome for Testing, persistent git-ignored profile, live upstream data.
// Headless gets a 403 from the stream host, so it is never used. One run at a time: the profile is locked while open.
export async function start(
  scenario,
  { ev, actions, proves, viewport = { width: 1280, height: 800 } },
) {
  mkdirSync(join(ev, 'video'), { recursive: true });
  mkdirSync(join(ev, 'shots'), { recursive: true });
  const recordVideo = { dir: join(ev, 'video', '.raw'), size: viewport };
  const EXT = join(REPO, 'apps/extension/dist/chrome-mv3');
  if (!existsSync(join(EXT, 'manifest.json')))
    throw new Error(
      `extension not built: run pnpm nx build extension-animevsub-helper (${EXT})`,
    );
  const profile = join(REPO, 'apps/web/artifacts/verify-web/ext-profile');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: false,
    viewport,
    recordVideo,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const page = await context.newPage();
  const url = (path) => `${BASE}${path}`;
  const consoleLines = [];
  page.on(
    'console',
    (m) =>
      ['error', 'warning'].includes(m.type()) &&
      consoleLines.push(`${m.type()}: ${m.text()}`),
  );
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  const t0 = Date.now();
  const ok = [];

  // Overlay text is set from script literals only, never from page content.
  const label = (text) =>
    page.evaluate((t) => {
      let el = document.getElementById('__verify_label');
      if (!el) {
        el = document.createElement('div');
        el.id = '__verify_label';
        el.style.cssText =
          'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:#000c;color:#fff;font:600 15px system-ui;padding:6px 14px;border-radius:8px;';
        document.documentElement.appendChild(el);
      }
      el.textContent = t;
    }, text);

  const api = {
    page,
    ok,
    consoleLines,
    url,
    hold: (ms = PACE.PAUSE_AFTER) => page.waitForTimeout(ms),
    async title() {
      await label(`Scenario: ${scenario}`);
      await page.waitForTimeout(PACE.TITLE_HOLD);
    },
    async step(text) {
      await label(text);
      await page.waitForTimeout(PACE.PAUSE_BEFORE);
    },
    async click(locator, text) {
      await api.step(text);
      await locator.click();
      await page.waitForTimeout(PACE.PAUSE_AFTER);
    },
    async type(locator, value, text) {
      await api.step(text);
      await locator.click();
      await locator.pressSequentially(value, { delay: PACE.TYPE_DELAY });
      await page.waitForTimeout(PACE.PAUSE_AFTER);
    },
    async shot(name) {
      await page.screenshot({
        path: join(ev, 'shots', `${scenario}-${name}.png`),
      });
    },
    // Record a check result. finish() writes PASS only if every check passed.
    check(name, pass) {
      ok.push({ name, pass: !!pass });
      console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
    },
    async finish() {
      await page.waitForTimeout(PACE.FINAL_HOLD);
      const video = page.video();
      await context.close(); // the clip is only complete once the page closes
      const raw = await video.path();
      const out = join(ev, 'video', `${scenario}.webm`);
      renameSync(raw, out);
      const pass = ok.length > 0 && ok.every((c) => c.pass);
      appendFileSync(
        join(ev, 'clips.md'),
        `- video/${scenario}.webm | ${proves} | ${pass ? 'PASS' : 'FAIL'}\n`,
      );
      appendFileSync(
        join(ev, `${scenario}.console.log`),
        consoleLines.join('\n') + '\n',
      );
      const secs = Number(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=nw=1:nk=1',
            out,
          ],
          { encoding: 'utf8' },
        ),
      );
      const per = secs / actions;
      const paced = per >= PACE.MIN_SEC_PER_ACTION;
      console.log(
        `pacing: ${secs.toFixed(1)}s for ${actions} actions = ${per.toFixed(2)}s/action (min ${PACE.MIN_SEC_PER_ACTION}) ${paced ? 'OK' : 'TOO FAST: raise PACE and re-record'}`,
      );
      console.log(
        `wall: ${((Date.now() - t0) / 1000).toFixed(1)}s, result ${pass ? 'PASS' : 'FAIL'}`,
      );
      return { pass, paced, secs };
    },
  };
  return api;
}
