// Scenario: live search from the top bar. Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/search-live.mjs
import { start } from './rec.mjs';
const r = await start('search-live', {
  ev: process.env.EV,
  actions: 7,
  proves:
    'search: Enter opens /search with cards, no match shows suggestions, clear empties the box, phone icon opens the bar',
});
const { page } = r;
const failed = [];
page.on('response', (res) => {
  if (res.status() >= 400 && !res.url().includes(':3100'))
    failed.push(`${res.status()} ${res.url()}`);
});

await page.goto(r.url('/'));
await page.waitForSelector('[data-testid="header"]', { timeout: 60000 });
await page.reload();
await page.waitForSelector('[data-testid="search:bar"]', { timeout: 60000 });
await r.title();
const bar = page.getByTestId('search:bar');
const closedWidth = (await bar.boundingBox()).width;
await r.shot('1-home');
r.check(
  `desktop: only the icon shows before a click (${closedWidth}px wide)`,
  closedWidth < 60,
);
await r.click(
  page.getByRole('button', { name: 'Tìm kiếm' }),
  'Click the search icon',
);
await page.waitForTimeout(400);
const openWidth = (await bar.boundingBox()).width;
r.check(
  `desktop: the box expands on click (${openWidth}px wide)`,
  openWidth > 200,
);
r.check(
  'input is focused after the click',
  await page
    .getByTestId('search:input')
    .evaluate((el) => el === document.activeElement),
);
await r.type(page.getByTestId('search:input'), 'one piece', 'Type "one piece"');
await page.keyboard.press('Enter');
await page.waitForSelector(
  '[data-testid="search:grid"], [data-testid="search:empty"]',
  { timeout: 60000 },
);
await r.shot('2-results');
r.check(
  'URL is /search?q=one piece',
  /\/search\?q=one(%20|\+| )piece/.test(page.url()),
);
const cards = await page
  .locator('[data-testid="search:grid"] [data-testid^="card:/"]')
  .count();
r.check(`results grid has cards (${cards})`, cards > 0);
r.check(
  'box keeps the query',
  (await page.getByTestId('search:input').inputValue()) === 'one piece',
);

await page.getByTestId('search:input').fill('');
await r.type(
  page.getByTestId('search:input'),
  'zzzqxjkw',
  'Type a query with no match',
);
await page.keyboard.press('Enter');
await page.waitForSelector('[data-testid="search:empty"]', { timeout: 60000 });
await r.shot('3-no-match');
r.check(
  'no match names the query',
  (await page.getByTestId('search:empty').innerText()).includes('zzzqxjkw'),
);

await r.click(
  page.getByRole('button', { name: 'Xóa nội dung tìm kiếm' }),
  'Clear the box',
);
r.check(
  'clear empties the input',
  (await page.getByTestId('search:input').inputValue()) === '',
);

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(r.url('/'));
await page.waitForSelector('[data-testid="search:bar"]', {
  state: 'attached',
  timeout: 60000,
});
await r.shot('4-phone-closed');
r.check(
  'phone: bar hidden until the icon is tapped',
  !(await page.getByTestId('search:input').isVisible()),
);
await r.click(
  page.getByRole('button', { name: 'Mở tìm kiếm' }),
  'Tap the search icon',
);
await r.shot('5-phone-open');
r.check(
  'phone: input visible after tap',
  await page.getByTestId('search:input').isVisible(),
);
await r.click(
  page
    .getByTestId('search:bar')
    .getByRole('button', { name: 'Hủy', exact: true }),
  'Tap Hủy',
);
r.check(
  'phone: Hủy closes the bar',
  !(await page.getByTestId('search:input').isVisible()),
);

r.check(
  `no failing upstream responses (${failed.join(', ') || 'none'})`,
  failed.length === 0,
);
const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
