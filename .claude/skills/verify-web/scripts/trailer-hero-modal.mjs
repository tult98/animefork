// Scenario: the hero and the details modal play the title's YouTube trailer. Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/trailer-hero-modal.mjs
import { start } from './rec.mjs';
const r = await start('trailer-hero-modal', {
  ev: process.env.EV,
  actions: 5,
  proves:
    'home: the hero trailer shows within moments with no YouTube overlay, plays cropped under the scrim, unmutes, holds the slide, stops when the details modal plays its own, stops while scrolled out of view and plays again on return; the card hover video shows within 2s with no YouTube overlay',
});
const { page } = r;
await page.goto(r.url('/'));
await page.waitForSelector('[data-testid="hero"]', { timeout: 60000 });
await page.reload();
await page.waitForSelector('[data-testid="hero"]', { timeout: 60000 });
await r.title();

const heroPlaying =
  '[data-testid^="hero:slide:"][data-active] [data-testid="trailer"][data-phase="playing"]';
await page.waitForSelector(heroPlaying, { timeout: 90000 });
const counter = await page.getByTestId('hero:counter').innerText();
await page.waitForTimeout(1200);
await r.shot('1-hero-trailer-just-shown');
await page.waitForTimeout(5000);
r.check(
  'hero video settles to its natural size once the YouTube overlay is gone',
  await page
    .locator(`${heroPlaying}[data-settled]`)
    .count()
    .then((n) => n === 1),
);
await r.shot('1b-hero-trailer-settled');

const layout = await page.evaluate((sel) => {
  const box = document.querySelector(sel).getBoundingClientRect();
  const frame = document.querySelector(`${sel} iframe`).getBoundingClientRect();
  const title = document.querySelector(
    '[data-testid^="hero:slide:"][data-active] [data-testid="hero:title"]',
  );
  const t = title.getBoundingClientRect();
  const top = document.elementFromPoint(t.left + 5, t.top + t.height / 2);
  return {
    covers:
      frame.left <= box.left &&
      frame.top <= box.top &&
      frame.right >= box.right &&
      frame.bottom >= box.bottom,
    titleOnTop: title.contains(top),
    box: [box.width, box.height],
    frame: [Math.round(frame.width), Math.round(frame.height)],
  };
}, heroPlaying);
r.check(`hero video covers its box (${JSON.stringify(layout)})`, layout.covers);
r.check('hero title sits above the video', layout.titleOnTop);

const isMuted = (scope) =>
  page.evaluate((s) => {
    const frame = document.querySelector(`${s} [data-testid="trailer"] iframe`);
    return window.YT.get(frame.id).isMuted();
  }, scope);
r.check('hero trailer starts muted', await isMuted('[data-testid="hero"]'));
await r.click(page.getByTestId('hero:mute'), 'Turn the hero trailer sound on');
await page.waitForTimeout(500);
r.check(
  'hero trailer unmuted',
  (await isMuted('[data-testid="hero"]')) === false,
);
await r.shot('2-hero-unmuted');
const still = await page.getByTestId('hero:counter').innerText();
r.check(
  `slide held while playing (${counter} -> ${still})`,
  counter === still || !(await page.locator(heroPlaying).count()),
);

await r.click(
  page.locator(
    '[data-testid^="hero:slide:"][data-active] [data-testid="hero:info"]',
  ),
  'Open the details',
);
await page.waitForSelector('[data-testid="details"]');
r.check(
  'hero trailer stopped while the modal is open',
  (await page
    .locator('[data-testid="hero"] [data-testid="trailer"]')
    .count()) === 0,
);
const modalTrailer = await page
  .waitForSelector(
    '[data-testid="details"] [data-testid="trailer"][data-phase="playing"]',
    { timeout: 30000 },
  )
  .then(() => true)
  .catch(() => false);
r.check('details trailer plays', modalTrailer);
if (modalTrailer) {
  await page.waitForTimeout(1200);
  await r.shot('3-details-trailer-just-shown');
  console.log(
    'details toggle label:',
    await page.getByTestId('details:mute').getAttribute('aria-label'),
  );
  r.check(
    'details trailer starts muted',
    await isMuted('[data-testid="details"]'),
  );
  await r.click(page.getByTestId('details:mute'), 'Turn the details sound on');
  await page.waitForTimeout(500);
  r.check(
    'details trailer unmuted',
    (await isMuted('[data-testid="details"]')) === false,
  );
  await r.shot('4-details-unmuted');
}
await r.click(page.getByTestId('details:close'), 'Close the details');

const heroTrailer = '[data-testid="hero"] [data-testid="trailer"]';
await page.waitForSelector(heroPlaying, { timeout: 60000 });
const before = await page.getByTestId('hero:counter').innerText();
await page.mouse.move(640, 700);
await page.mouse.wheel(0, 900);
await page
  .waitForFunction((sel) => !document.querySelector(sel), heroTrailer, {
    timeout: 5000,
  })
  .catch(() => {});
r.check(
  'hero trailer removed once the hero is scrolled out of view',
  (await page.locator(heroTrailer).count()) === 0,
);
await r.shot('5-hero-scrolled-away');
await page.waitForTimeout(9000);
const offscreen = await page.getByTestId('hero:counter').innerText();
r.check(
  `slide held while out of view (${before} -> ${offscreen})`,
  before === offscreen,
);
await page.mouse.wheel(0, -2000);
const back = await page
  .waitForSelector(heroPlaying, { timeout: 60000 })
  .then(() => true)
  .catch(() => false);
r.check('hero trailer plays again after scrolling back up', back);
await page.waitForTimeout(1200);
await r.shot('6-hero-back-in-view');

const cards = page.locator(
  '[data-testid="shelf:airing-this-season"] [data-testid^="card:/"]',
);
const cardPlaying = '[data-testid="card:promo-video"][data-phase="playing"]';
let promo = false;
let shownAfter = null;
for (let i = 0; i < 6 && !promo; i++) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
  await cards.nth(i).hover();
  const hovered = Date.now();
  promo = await page
    .waitForSelector('[data-testid="card:promo-video"]', { timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  if (promo) {
    await page.locator('[data-testid$=":preview"]').hover();
    shownAfter = await page
      .waitForSelector(cardPlaying, { timeout: 5000 })
      .then(() => Date.now() - hovered)
      .catch(() => null);
  }
}
r.check(
  'card hover plays its promo video (live data: one of the first 6 airing cards has a trailer)',
  promo,
);
if (promo) {
  r.check(
    `card video shown within 2s of the hover (${shownAfter}ms)`,
    shownAfter !== null && shownAfter <= 2000,
  );
  await page.waitForTimeout(700);
  const opacity = await page.evaluate(
    (sel) => getComputedStyle(document.querySelector(sel)).opacity,
    cardPlaying,
  );
  r.check(`card video fully shown (opacity ${opacity})`, opacity === '1');
  await r.shot('7-card-hover-just-shown');
  await page.waitForSelector(`${cardPlaying}[data-settled]`, {
    timeout: 8000,
  });
  const card = await page.evaluate((sel) => {
    const box = document.querySelector(sel);
    const b = box.getBoundingClientRect();
    const f = box.querySelector('iframe').getBoundingClientRect();
    return {
      covers:
        f.left < b.left &&
        f.top < b.top &&
        f.right > b.right &&
        f.bottom > b.bottom,
      box: [Math.round(b.width), Math.round(b.height)],
      frame: [Math.round(f.width), Math.round(f.height)],
    };
  }, cardPlaying);
  r.check(
    `card video settled and cropped past its box (${JSON.stringify(card)})`,
    card.covers,
  );
  await r.shot('8-card-hover-settled');
}

const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
