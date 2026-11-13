// Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/watch-episodes-anchor.mjs
// Needs a title with 150+ episodes (One Piece by default). Nothing is mocked.
import { start } from './rec.mjs';
const SLUG = process.env.SLUG ?? 'one-piece-dao-hai-tac-a1';
const r = await start('watch-episodes-anchor', {
  ev: process.env.EV,
  actions: 5,
  proves:
    'episodes panel opens at the playing episode 150 and keeps the view still while earlier rows are added above',
});
const { page } = r;

const scroller = page.locator(
  '[data-testid="player:episodes-panel"] .pl-scroll',
);
const rendered = () =>
  scroller.evaluate((el) =>
    [...el.querySelectorAll('[data-testid^="episode:"]')]
      .map((e) => e.dataset.testid)
      .filter((id) => /^episode:\d+$/.test(id))
      .map((id) => Number(id.slice('episode:'.length))),
  );
const offsetOf = (n) =>
  scroller.evaluate((el, testid) => {
    const row = el.querySelector(`[data-testid="${testid}"]`);
    return row.getBoundingClientRect().top - el.getBoundingClientRect().top;
  }, `episode:${n}`);

await page.goto(r.url(`/watch/${SLUG}`));
await page.waitForSelector('[data-testid="player:video"]', { timeout: 60000 });
await page.getByTestId('player:episodes').click();
for (let i = 0; i < 6 && !(await rendered()).includes(150); i++) {
  const rows = await rendered();
  await scroller.evaluate(
    (el, down) => el.scrollTo({ top: down ? el.scrollHeight : 0 }),
    rows.length > 0 && Math.max(...rows) < 150,
  );
  await page.waitForTimeout(800);
}
await page.getByTestId('episode:150').click();
await page.waitForURL(/\/watch\/[^/]+\/\d+/, { timeout: 15000 });
const watchUrl = page.url();
await page.mouse.move(400, 300);

await page.goto(watchUrl);
await page.waitForSelector('[data-testid="player:video"]', { timeout: 60000 });
await r.title();

// Chrome's own scroll anchoring would hide a broken fix. Safari may not anchor, so turn it off to test the app's.
await page.addStyleTag({ content: '.pl-scroll { overflow-anchor: none; }' });

await r.click(page.getByTestId('player:episodes'), 'Open the episodes panel');
await page.getByTestId('episode:150').waitFor({ timeout: 15000 });
await page.waitForTimeout(1000);
await r.shot('1-opened');
const current = await scroller.evaluate((el) => {
  const row = el.querySelector('[aria-current="true"]');
  const box = el.getBoundingClientRect();
  const rect = row?.getBoundingClientRect();
  return {
    testid: row?.dataset.testid,
    inView: !!rect && rect.top >= box.top && rect.bottom <= box.bottom,
  };
});
r.check(
  `the playing row is episode 150 (${current.testid})`,
  current.testid === 'episode:150',
);
r.check('the playing row is inside the panel viewport', current.inView);
const opened = await rendered();
r.check(
  `rows start a few before the playing one (${Math.min(...opened)}..${Math.max(...opened)})`,
  Math.min(...opened) === 145 && !opened.includes(1),
);

for (let step = 1; step <= 3; step++) {
  await r.click(
    page.getByTestId('player:episodes'),
    `Scroll to the top of the list (${step})`,
  );
  const before = await rendered();
  const top = Math.min(...before);
  await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
  const offset = await offsetOf(top);
  await page
    .getByTestId(`episode:${top - 1}`)
    .waitFor({ state: 'attached', timeout: 10000 });
  await page.waitForTimeout(500);
  const after = await rendered();
  const moved = (await offsetOf(top)) - offset;
  r.check(
    `prepend ${step} adds earlier rows (first ${top} -> ${Math.min(...after)})`,
    Math.min(...after) < top,
  );
  r.check(
    `episode ${top} stays where it was on screen (moved ${moved.toFixed(1)}px)`,
    Math.abs(moved) <= 2,
  );
  await r.shot(`2-prepend-${step}`);
}
r.check('episode 1 is reached', (await rendered()).includes(1));

const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
