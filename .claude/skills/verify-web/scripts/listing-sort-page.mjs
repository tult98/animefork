// Scenario: live airing listing sort + paging. Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/listing-sort-page.mjs
import { start } from './rec.mjs';
const r = await start('listing-sort-page', { ev: process.env.EV, actions: 4, proves: 'airing listing: sort changes URL and order, pager goes to page 2' });
const { page } = r;
const first = () => page.locator('[data-testid="listing:grid"] [data-testid^="card:/"]').first().getAttribute('data-testid');

await page.goto(r.url('/airing-this-season'));
await page.waitForSelector('[data-testid="listing:grid"]', { timeout: 60000 });
await page.reload(); // warm
await page.waitForSelector('[data-testid="listing:grid"]', { timeout: 60000 });
await r.title();
// Sort and pager are disabled until every season page has loaded.
await page.waitForSelector('[data-testid="listing:sort"]:not([disabled])', { timeout: 60000 });
const count = await page.getByTestId('listing:count').innerText();
const before = await first();
await r.shot('1-before');
r.check(`count shows titles (${count})`, /\d+ phim/.test(count));

await r.click(page.getByTestId('listing:sort'), 'Open the sort menu');
await r.click(page.getByTestId('listing:sort:option:views-desc'), 'Pick "Xem nhiều nhất"');
await page.waitForFunction(() => location.search.includes('sort=views-desc'));
const after = await first();
await r.shot('2-sorted');
r.check('URL has sort=views-desc', page.url().includes('sort=views-desc'));
// Live data: only the order is asserted, never which title comes first.
r.check(`first card changed (${before} -> ${after})`, before !== after);

if (await page.getByTestId('listing:pager').count()) {
  await r.click(page.getByTestId('listing:next'), 'Go to the next page');
  await page.waitForFunction(() => location.search.includes('page=2'));
  await r.shot('3-page2');
  r.check('URL has page=2', page.url().includes('page=2'));
  r.check('grid still has cards', (await page.locator('[data-testid^="card:/"]').count()) > 0);
} else console.log('no pager (30 titles or fewer); page step skipped');
const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
