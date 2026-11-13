// Scenario: the hero and the details modal play the title's YouTube trailer. Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/trailer-hero-modal.mjs
import { start } from './rec.mjs';
const r = await start('trailer-hero-modal', {
  ev: process.env.EV,
  actions: 5,
  proves:
    'home: the hero trailer plays cropped under the scrim, unmutes, holds the slide, stops when the details modal plays its own; the card hover still plays',
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
await page.waitForTimeout(5000);
await r.shot('1-hero-trailer');

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
  await page.waitForTimeout(5000);
  await r.shot('3-details-trailer');
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

await page
  .locator('[data-testid="shelf:airing-this-season"] [data-testid^="card:/"]')
  .first()
  .hover();
const promo = await page
  .waitForSelector('[data-testid="card:promo-video"]', { timeout: 5000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(2500);
await r.shot('5-card-hover');
r.check(
  'card hover still plays its promo video (live data: the first airing card must have a trailer)',
  promo,
);

const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
