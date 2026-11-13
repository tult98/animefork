// Scenario: the player's season picker lists seasons by MAL start date. Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/watch-season-order.mjs
// Live data: the title is the first home-page card whose watch page has 3+ seasons. Nothing is mocked.
import { start } from './rec.mjs';
const r = await start('watch-season-order', {
  ev: process.env.EV,
  actions: 1,
  proves:
    'season picker lists the main line by start date first, then movie/special/OVA entries',
});
const { page } = r;
const bad = [];
page.on(
  'response',
  (res) =>
    res.status() >= 400 &&
    !res.url().includes(':3100') &&
    // The autoplaying stream is not under test here, and its host rate-limits repeated runs.
    !res.url().includes('stream.googleapiscdn.com') &&
    bad.push(`${res.status()} ${new URL(res.url()).host}`),
);
const lookups = [];
page.on('response', async (res) => {
  if (res.url().endsWith('/v1/art/lookup') && res.ok()) {
    lookups.push(await res.json().catch(() => null));
  }
});

async function openEpisodesPanel() {
  await page.getByTestId('player:episodes').click();
}

const pad = (d) => `${d}${'-01-01'.slice(Math.max(0, d.length - 4))}`;
const SIDE = /\b(movie|special|ova|ona)\b/i;

await page.goto(r.url('/'));
await page.waitForSelector('[data-testid^="card:/phim/"]', { timeout: 60000 });
const slugs = [
  ...new Set(
    (
      await page
        .locator('[data-testid^="card:/phim/"]')
        .evaluateAll((els) => els.map((e) => e.dataset.testid))
    ).map((t) => t.split('/')[2]),
  ),
].slice(0, 24);

let found = null;
for (const slug of slugs) {
  await page.goto(r.url(`/watch/${slug}`));
  await page.waitForSelector('[data-testid="player:video"]', {
    timeout: 60000,
  });
  const back = page.getByTestId('player:seasons');
  // A single season has no season button. The panel is a hover popup on the episodes control.
  if ((await back.count()) === 0) continue;
  await openEpisodesPanel();
  await back.click();
  const panel = page.getByTestId('player:seasons-panel');
  await panel.waitFor();
  const ids = await panel
    .locator('[data-testid^="season:"]')
    .evaluateAll((els) => els.map((e) => e.dataset.testid.slice(7)));
  if (ids.length >= 3) {
    found = slug;
    break;
  }
}
if (!found) {
  console.log('SKIPPED: no live title with 3+ seasons among the home cards');
  await r.finish();
  process.exit(2);
}

await page.goto(r.url(`/watch/${found}`));
await page.waitForSelector('[data-testid="player:video"]', { timeout: 60000 });
await r.title();
await openEpisodesPanel();
await page.getByTestId('player:seasons').click();
const panel = page.getByTestId('player:seasons-panel');
await panel.waitFor();
const read = () =>
  panel
    .locator('[data-testid^="season:"]')
    .evaluateAll((els) => els.map((e) => e.dataset.testid.slice(7)));
const labels = () =>
  panel
    .locator('[data-testid^="season:"]')
    .evaluateAll((els) => els.map((e) => e.textContent.trim()));
await r.shot('1-picker-first-paint');
const first = await read();

// The API fills MAL in the background, so give the polling lookup time to answer.
let dates = {};
for (let i = 0; i < 30; i++) {
  const last = lookups.at(-1);
  // Several lookups run on the page (the title's art, the siblings), so the dates come from all of their answers.
  dates = {};
  for (const answer of lookups) {
    for (const [k, v] of Object.entries(answer?.ratings ?? {})) {
      if (v.mal?.startDate) dates[k] = v.mal.startDate;
    }
  }
  if (last && last.ratingsPending !== true) break;
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(1500);
const final = await read();
await r.shot('2-picker-after-lookup');
const finalLabels = await labels();
console.log('slug', found);
console.log('labels', JSON.stringify(await labels()));
console.log('first paint', JSON.stringify(first));
console.log('dates', JSON.stringify(dates));
console.log('final', JSON.stringify(final));

const datedCount = Object.values(dates).filter(Boolean).length;
r.check(
  `the lookup was asked for the siblings (${lookups.length} answers)`,
  lookups.length > 0,
);
r.check(`some seasons came back dated (${datedCount})`, datedCount >= 2);
r.check(
  'the picker keeps the same seasons',
  [...final].sort().join() === [...first].sort().join(),
);
const isSide = finalLabels.map((l) => SIDE.test(l));
r.check(
  `main-line seasons come before side entries (${finalLabels.join(' | ')})`,
  isSide.every((side, i) => !side || isSide.slice(i).every(Boolean)),
);
const mainDates = final.flatMap((slug, i) =>
  !isSide[i] && dates[slug] ? [pad(dates[slug])] : [],
);
r.check(
  `main-line seasons read oldest to newest (${mainDates.join(' < ') || 'no dates'})`,
  mainDates.every((d, i) => i === 0 || mainDates[i - 1] <= d),
);
r.check(
  `no failing upstream requests (${bad.join(', ') || 'none'})`,
  bad.length === 0,
);
const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
