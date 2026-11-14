// Scenario: on a 2x display every trailer starts in one piece, under the GPU texture limit, and shows within 1s. Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/trailer-start-even.mjs
import { start } from './rec.mjs';
const r = await start('trailer-start-even', {
  ev: process.env.EV,
  actions: 1,
  deviceScaleFactor: 2,
  proves:
    'home at 2x: the hero, details and card trailers start laid out under 15000 device px, so the video fades in whole instead of wiping in, and each is fully shown within 1s of playing',
});
const { page } = r;
await page.addInitScript(() => {
  window.__playing = new Map();
  window.__shown = new Map();
  document.addEventListener(
    'transitionend',
    (event) => {
      const { target } = event;
      if (
        event.propertyName === 'opacity' &&
        target.classList?.contains('trailer') &&
        getComputedStyle(target).opacity === '1' &&
        !window.__shown.has(target)
      )
        window.__shown.set(target, performance.now());
    },
    true,
  );
  new MutationObserver((records) => {
    for (const { target } of records) {
      if (
        target.classList?.contains('trailer') &&
        target.dataset.phase === 'playing' &&
        !window.__playing.has(target)
      )
        window.__playing.set(target, performance.now());
    }
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-phase'],
  });
});
await page.goto(r.url('/'));
await page.waitForSelector('[data-testid="hero"]', { timeout: 60000 });
await page.reload();
await page.waitForSelector('[data-testid="hero"]', { timeout: 60000 });
await r.title();

async function startOf(sel, label) {
  await page.waitForSelector(`${sel}[data-phase="playing"]`, {
    timeout: 90000,
  });
  const layer = await page.evaluate((s) => {
    const box = document.querySelector(s);
    const frame = box.querySelector('iframe');
    return {
      settled: box.hasAttribute('data-settled'),
      oversize: Number(getComputedStyle(box).getPropertyValue('--oversize')),
      devicePx:
        Math.max(frame.offsetWidth, frame.offsetHeight) * devicePixelRatio,
    };
  }, sel);
  const shownAfter = await page
    .waitForFunction(
      (sel) => {
        const box = document.querySelector(sel);
        const shown = window.__shown.get(box);
        return shown === undefined
          ? false
          : { ms: Math.round(shown - window.__playing.get(box)) };
      },
      sel,
      { timeout: 5000 },
    )
    .then(async (h) => (await h.jsonValue()).ms)
    .catch(() => Infinity);
  await r.shot(`${label}-just-shown`);
  return { ...layer, shownAfter };
}
const ok = (s) => !s.settled && s.devicePx <= 15000 && s.shownAfter <= 1000;

const hero =
  '[data-testid^="hero:slide:"][data-active] [data-testid="trailer"]';
const heroStart = await startOf(hero, '1-hero');
r.check(
  `hero starts in one piece and shows within 1s (${JSON.stringify(heroStart)})`,
  ok(heroStart),
);

await r.click(
  page.locator(
    '[data-testid^="hero:slide:"][data-active] [data-testid="hero:info"]',
  ),
  'Open the details',
);
const details = '[data-testid="details"] [data-testid="trailer"]';
const detailsStart = await startOf(details, '2-details');
r.check(
  `details starts in one piece and shows within 1s (${JSON.stringify(detailsStart)})`,
  ok(detailsStart),
);
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page
  .waitForSelector('[data-testid="details"]', { state: 'detached' })
  .catch(() => {});

const cards = page.locator(
  '[data-testid="shelf:airing-this-season"] [data-testid^="card:/"]',
);
const card = '[data-testid="card:promo-video"]';
let cardStart = null;
for (let i = 0; i < 6 && cardStart === null; i++) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
  await cards.nth(i).hover();
  const shown = await page
    .waitForSelector(card, { timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  if (!shown) continue;
  await page.locator('[data-testid$=":preview"]').hover();
  const playing = await page
    .waitForSelector(`${card}[data-phase="playing"]`, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (playing) cardStart = await startOf(card, '3-card');
}
r.check(
  `a card trailer starts in one piece and shows within 1s (${JSON.stringify(cardStart)})`,
  cardStart !== null && ok(cardStart),
);

const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
