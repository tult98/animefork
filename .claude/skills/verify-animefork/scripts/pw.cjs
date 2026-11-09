// Shared Playwright harness for verify-animefork. Use: const pw = require('<skill>/scripts/pw.cjs')
// Opens Chromium headless (new headless) with the built AnimeVsub Helper extension loaded, one fresh
// profile + one recorded page per scenario. No credentials are read or written here.
const fs = require('fs')
const path = require('path')
const os = require('os')
const cp = require('child_process')

// ---- tunable pacing (ms unless noted). Raise them if the pacing self-check fails. ----
const PACE = { PAUSE_BEFORE: 1000, PAUSE_AFTER: 1000, TYPE_DELAY: 120, FINAL_HOLD: 2000, MIN_SEC_PER_ACTION: 2 }

const REPO = path.resolve(__dirname, '../../../..')
const EXT = path.join(REPO, 'apps/extension/manifest-v3/extension')
const BASE = process.env.VERIFY_ANIMEVSUB_URL || 'http://localhost:9000'

function sh(c) { return cp.execSync(c, { encoding: 'utf8' }).trim() }

function playwrightCore() {
  if (process.env.PW) return require(process.env.PW)
  const g = sh('npm root -g')
  for (const p of ['playwright-core', 'playwright', '@playwright/cli/node_modules/playwright-core']) {
    if (fs.existsSync(path.join(g, p))) return require(path.join(g, p))
  }
  try { return require('playwright-core') } catch {}
  throw new Error('playwright-core not found: install with `npm i -g @playwright/cli` or set PW=<path to playwright-core>')
}

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME
  const cache = process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Caches/ms-playwright') : path.join(os.homedir(), '.cache/ms-playwright')
  const dirs = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => parseInt(b.slice(9)) - parseInt(a.slice(9)))
  for (const d of dirs) {
    const cands = [
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-linux/chrome',
    ].map((c) => path.join(cache, d, c))
    const hit = cands.find((c) => fs.existsSync(c))
    if (hit) return hit
  }
  throw new Error('no Playwright chromium in ' + cache + ': run `playwright-cli install-browser` or set CHROME=<binary>')
}

// open({ runDir, scenario }) -> { page, ctx, step, say, type, close }
async function open({ runDir, scenario }) {
  const { chromium } = playwrightCore()
  fs.mkdirSync(path.join(runDir, 'video'), { recursive: true })
  fs.mkdirSync(path.join(runDir, 'shots'), { recursive: true })
  const ctx = await chromium.launchPersistentContext(path.join(runDir, 'profile-' + scenario), {
    executablePath: chromePath(),
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: path.join(runDir, 'video-raw-' + scenario), size: { width: 1280, height: 800 } },
  })
  const page = await ctx.newPage()
  const consoleLog = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleLog.push(`[${m.type()}] ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => consoleLog.push('[pageerror] ' + String(e).slice(0, 300)))
  let actions = 0
  const api = {
    page, ctx, BASE, PACE, consoleLog,
    // Show a label (LITERALS ONLY, never page/API text) on top of the page. Re-call after every navigation.
    async say(text) {
      await page.evaluate((t) => {
        let el = document.getElementById('__verify_label')
        if (!el) {
          el = document.createElement('div')
          el.id = '__verify_label'
          el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;background:#000c;color:#fff;font:600 18px sans-serif;padding:8px 16px;border-radius:8px;pointer-events:none'
          document.documentElement.appendChild(el)
        }
        el.textContent = t
      }, text)
    },
    // One paced user action: label, pause, act, pause. Counts toward the pacing check.
    async step(label, fn) {
      await api.say(label)
      await page.waitForTimeout(PACE.PAUSE_BEFORE)
      await fn()
      actions++
      await page.waitForTimeout(PACE.PAUSE_AFTER)
    },
    // Click a field then type character by character.
    async type(locator, text) {
      await locator.click()
      await page.keyboard.type(text, { delay: PACE.TYPE_DELAY })
    },
    async shot(name) { await page.screenshot({ path: path.join(runDir, 'shots', `${scenario}-${name}.png`) }) },
    async snap(name) { fs.writeFileSync(path.join(runDir, 'shots', `${scenario}-${name}.aria.txt`), await page.locator('body').ariaSnapshot()) },
    // close({ pass, proves }) -> finishes the clip, appends clips.md, runs the pacing self-check. Returns { ok, seconds }.
    async close({ pass, proves }) {
      await page.waitForTimeout(PACE.FINAL_HOLD)
      const video = page.video()
      await page.close()
      const out = path.join(runDir, 'video', scenario + '.webm')
      await video.saveAs(out)
      await ctx.close()
      fs.rmSync(path.join(runDir, 'video-raw-' + scenario), { recursive: true, force: true })
      fs.writeFileSync(path.join(runDir, scenario + '.console.log'), consoleLog.join('\n'))
      const seconds = parseFloat(sh(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`))
      const ok = seconds >= actions * PACE.MIN_SEC_PER_ACTION
      fs.appendFileSync(path.join(runDir, 'clips.md'), `- video/${scenario}.webm | ${proves} | ${pass ? 'PASS' : 'FAIL'}\n`)
      console.log(`PACING ${ok ? 'OK' : 'TOO FAST'}: ${seconds.toFixed(1)}s for ${actions} actions (min ${PACE.MIN_SEC_PER_ACTION}s/action)`)
      return { ok, seconds }
    },
  }
  return api
}

module.exports = { open, PACE, BASE, EXT, playwrightCore, chromePath }
