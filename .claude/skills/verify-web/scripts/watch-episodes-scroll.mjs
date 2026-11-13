// Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/watch-episodes-scroll.mjs
// Needs apps/api on :3100 with MAL episodes for SLUG (One Piece by default). Nothing is mocked.
import { start } from './rec.mjs';
const SLUG = process.env.SLUG ?? 'one-piece-dao-hai-tac-a1';
const r = await start('watch-episodes-scroll', {
  ev: process.env.EV,
  actions: 4,
  proves:
    'episodes panel: 50 rows, more on scroll, episode info fetched per 100-episode page',
});
const { page } = r;

const infoRequests = [];
page.on('request', (req) => {
  const url = new URL(req.url());
  if (url.port === '3100' && url.pathname === `/v1/episodes/${SLUG}`)
    infoRequests.push(url.searchParams.get('from'));
});
const rows = () =>
  page
    .locator('[data-testid^="episode:"]')
    .evaluateAll(
      (els) =>
        els.filter((e) => /^episode:\d+$/.test(e.dataset.testid ?? '')).length,
    );
const scrollPanel = () =>
  page
    .locator('[data-testid="player:episodes-panel"] .pl-scroll')
    .evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

await page.goto(r.url(`/watch/${SLUG}`));
await page.waitForSelector('[data-testid="player:video"]', { timeout: 60000 });
infoRequests.length = 0;
await page.reload();
await page.waitForSelector('[data-testid="player:video"]', { timeout: 60000 });
await r.title();

await r.click(page.getByTestId('player:episodes'), 'Open the episodes panel');
await page.waitForSelector('[data-testid="episode:1"]');
await page.waitForTimeout(1500);
await r.shot('1-panel');
const first = await rows();
r.check(`panel renders 50 rows at first (${first})`, first === 50);
r.check(
  `only the first page of info is asked for (${JSON.stringify(infoRequests)})`,
  infoRequests.includes('1') && infoRequests.every((f) => f === '1'),
);

await r.click(
  page.getByTestId('player:episodes'),
  'Scroll to the end of the list',
);
await scrollPanel();
await page.waitForSelector('[data-testid="episode:100"]', { timeout: 10000 });
r.check(
  `one scroll renders 100 rows (${await rows()})`,
  (await rows()) === 100,
);
r.check('page 101 not asked for yet', !infoRequests.includes('101'));

await r.click(page.getByTestId('player:episodes'), 'Scroll again');
await scrollPanel();
await page.waitForSelector('[data-testid="episode:150"]', { timeout: 10000 });
await page.waitForTimeout(2000);
await r.shot('2-scrolled');
r.check(
  `second scroll renders 150 rows (${await rows()})`,
  (await rows()) === 150,
);
r.check(
  `page 101 asked for once rows pass 100 (${JSON.stringify(infoRequests)})`,
  infoRequests.includes('101'),
);
const row150 = await page.getByTestId('episode:150').textContent();
r.check(
  `episode 150 has a name, not only its label (${row150.slice(0, 60)})`,
  row150.replace(/Tập 150/, '').trim().length > 0,
);

await r.click(page.getByTestId('episode:150'), 'Play episode 150');
await page.waitForURL(/\/watch\/[^/]+\/\d+/, { timeout: 15000 });
await page.mouse.move(400, 300);
const name = page.getByTestId('player:episode-name');
await name.waitFor({ timeout: 15000 }).catch(() => {});
await r.shot('3-episode-150');
r.check(
  `player names episode 150 (${await name.textContent().catch(() => 'missing')})`,
  (await name.count()) === 1,
);
const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
