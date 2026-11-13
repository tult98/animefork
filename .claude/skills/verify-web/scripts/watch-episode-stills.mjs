// Run: EV=<evidence dir> node .claude/skills/verify-web/scripts/watch-episode-stills.mjs
// Needs apps/api on :3100 with TMDB stills for episodes 1-150 of SLUG (Detective Conan by default). Nothing is mocked.
import { start } from './rec.mjs';
const SLUG = process.env.SLUG ?? 'tham-tu-lung-danh-conan-a3';
const r = await start('watch-episode-stills', {
  ev: process.env.EV,
  actions: 3,
  proves:
    'episodes panel: rows show TMDB stills, fetched per 100-episode page only for the rendered rows',
});
const { page } = r;

const stillsRequests = [];
page.on('request', (req) => {
  const url = new URL(req.url());
  if (url.port === '3100' && url.pathname === `/v1/art/stills/${SLUG}`)
    stillsRequests.push(Number(url.searchParams.get('from')));
});
const rows = () =>
  page
    .locator('[data-testid="player:episodes-panel"] [data-testid^="episode:"]')
    .evaluateAll((els) =>
      els
        .filter((e) => /^episode:\d+$/.test(e.dataset.testid ?? ''))
        .map((e) => ({
          n: Number(e.dataset.testid.slice('episode:'.length)),
          label: Number(/^Tập (\d+)(?![\d.])/.exec(e.textContent)?.[1]),
          still: !!e.querySelector('img[src*="image.tmdb.org/t/p/w300"]'),
        })),
    );
const bucketsOf = (list) => [
  ...new Set(
    list
      .filter(({ label }) => label > 0)
      .map(({ label }) => Math.floor((label - 1) / 100) * 100 + 1),
  ),
];
const onlyRenderedBuckets = (list) => {
  const allowed = bucketsOf(list);
  return stillsRequests.every((from) => allowed.includes(from));
};
const waitForStills = (n) =>
  page.waitForSelector(
    `[data-testid="episode:${n}"] img[src*="image.tmdb.org/t/p/w300"]`,
    { timeout: 15000 },
  );
const scrollPanel = () =>
  page
    .locator('[data-testid="player:episodes-panel"] .pl-scroll')
    .evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

await page.goto(r.url(`/watch/${SLUG}`));
await page.waitForSelector('[data-testid="player:video"]', { timeout: 60000 });
stillsRequests.length = 0;
await page.reload();
await page.waitForSelector('[data-testid="player:video"]', { timeout: 60000 });
await r.title();

await r.click(page.getByTestId('player:episodes'), 'Open the episodes panel');
await page.waitForSelector('[data-testid="episode:1"]');
await waitForStills(1).catch(() => {});
await page.waitForTimeout(1000);
await r.shot('1-panel');
const first = await rows();
const firstMissing = first.filter((row) => !row.still).map(({ n }) => n);
r.check(
  `every rendered row shows a TMDB still (${first.length} rows, missing ${JSON.stringify(firstMissing)})`,
  first.length > 0 && firstMissing.length === 0,
);
r.check(
  `stills asked only for the buckets of rendered rows (${JSON.stringify(stillsRequests)})`,
  stillsRequests.includes(1) && onlyRenderedBuckets(first),
);

await r.click(
  page.getByTestId('player:episodes'),
  'Scroll to the end of the list',
);
await scrollPanel();
await page.waitForSelector('[data-testid="episode:100"]', { timeout: 10000 });
const asked = [...stillsRequests];
const middle = await rows();
const highest = Math.max(...middle.map(({ label }) => label || 0));
r.check(
  `after one scroll the highest rendered episode is ${highest} and stills asked ${JSON.stringify(asked)}`,
  highest > 100 === asked.includes(101) && onlyRenderedBuckets(middle),
);

await r.click(page.getByTestId('player:episodes'), 'Scroll again');
await scrollPanel();
await page.waitForSelector('[data-testid="episode:150"]', { timeout: 10000 });
await waitForStills(150).catch(() => {});
await page.waitForTimeout(1000);
await r.shot('2-scrolled');
const second = await rows();
const secondMissing = second.filter((row) => !row.still).map(({ n }) => n);
r.check(
  `stills for from=101 asked once rendered episodes pass 100 (${JSON.stringify(stillsRequests)})`,
  stillsRequests.includes(101),
);
r.check(
  `every rendered row up to episode ${Math.max(...second.map(({ label }) => label || 0))} shows a TMDB still (missing ${JSON.stringify(secondMissing)})`,
  secondMissing.length === 0,
);
r.check(
  'stills still asked only for the buckets of rendered rows',
  onlyRenderedBuckets(second),
);

const res = await r.finish();
process.exit(res.pass && res.paced ? 0 : 1);
