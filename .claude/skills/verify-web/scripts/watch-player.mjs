// Scenario: live watch page, real stream through the extension. Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/watch-player.mjs
// The real player AUTOPLAYS, so a click on player:play right after load pauses it. Assert autoplay first.
import { start } from './rec.mjs';
const r = await start('watch-player', {
  ev: process.env.EV,
  actions: 4,
  proves:
    'watch page: real stream autoplays, pause freezes, play resumes, 2x applies',
});
const { page } = r;
const bad = [];
page.on(
  'response',
  (res) =>
    res.status() >= 400 &&
    !res.url().includes(':3100') &&
    bad.push(`${res.status()} ${new URL(res.url()).host}`),
);
const vid = page.getByTestId('player:video');
const st = () =>
  vid.evaluate((v) => ({
    t: v.currentTime,
    paused: v.paused,
    rate: v.playbackRate,
  }));

// Pick a title from the live home page: the first new-episodes card.
await page.goto(r.url('/'));
await page.waitForSelector(
  '[data-testid="shelf:new-episodes"] [data-testid^="card:/phim/"]',
  { timeout: 60000 },
);
const slug = (
  await page
    .locator('[data-testid="shelf:new-episodes"] [data-testid^="card:/phim/"]')
    .first()
    .getAttribute('data-testid')
).split('/')[2];
await page.goto(r.url(`/watch/${slug}`));
await page.waitForSelector('[data-testid="player:video"]', { timeout: 60000 });
await page.reload(); // warm
await page.waitForSelector('[data-testid="player:video"]', { timeout: 60000 });
await r.title();
await page.waitForFunction(
  () =>
    document.querySelector('[data-testid="player:video"]').currentTime > 1.5,
  null,
  { timeout: 60000 },
);
await r.shot('1-autoplay');
r.check('stream autoplays (currentTime > 1.5)', (await st()).t > 1.5);

await r.click(page.getByTestId('player:play'), 'Press pause');
const p1 = await st();
await r.hold(1500);
const p2 = await st();
r.check(
  `paused and frozen (${p1.t.toFixed(1)}s -> ${p2.t.toFixed(1)}s)`,
  p1.paused && p2.t === p1.t,
);
await r.shot('2-paused');
await r.click(page.getByTestId('player:play'), 'Press play');
await page
  .waitForFunction(
    (t) =>
      document.querySelector('[data-testid="player:video"]').currentTime >
      t + 1.5,
    p2.t,
    { timeout: 30000 },
  )
  .catch(() => {});
r.check('resumes after play', (await st()).t > p2.t + 1.5);

await r.click(page.getByTestId('player:speed'), 'Open speed panel');
await r.click(page.getByTestId('speed:2'), 'Pick 2x');
r.check(
  `playbackRate is 2 (got ${(await st()).rate})`,
  (await st()).rate === 2,
);
r.check(
  'no player error screen',
  (await page.getByTestId('player:error').count()) === 0,
);
r.check(
  `no failing upstream requests (${bad.join(', ') || 'none'})`,
  bad.length === 0,
);
await r.shot('3-2x');
const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
