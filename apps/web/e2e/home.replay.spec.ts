import { expect, test } from './fixtures.ts';

const SEASON_PATH = '/season/autumn/2026/';

async function shelves(page: import('@playwright/test').Page) {
  return (await page.evaluate(() => window.__app?.shelves())) ?? [];
}

test('home renders the hero and the three shelves in order', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  await expect(page.getByTestId('shelf:airing-this-season')).toBeVisible();

  const rendered = await shelves(page);
  expect(rendered.map((s) => s.id)).toEqual([
    'hero',
    'new-episodes',
    'top-10-today',
    'airing-this-season',
  ]);
  for (const shelf of rendered) {
    const rows =
      shelf.id === 'hero'
        ? page.locator('[data-testid^="hero:slide:"]')
        : page.getByTestId(`shelf:${shelf.id}`).getByRole('listitem');
    await expect(rows).toHaveCount(shelf.paths.length);
  }
  await expect(page.getByTestId('error-screen')).toHaveCount(0);
});

test('shelf contents follow the dedupe rules', async ({ page }) => {
  await page.goto('/?transport=replay');
  await expect(page.getByTestId('shelf:airing-this-season')).toBeVisible();

  const byId = Object.fromEntries(
    (await shelves(page)).map((s) => [s.id, s.paths]),
  );
  expect(byId['hero']).toHaveLength(10);
  expect(byId['new-episodes']).toHaveLength(10);
  expect(byId['top-10-today']).toHaveLength(10);
  expect(byId['airing-this-season']).toHaveLength(12);

  const news = new Set(byId['new-episodes']);
  expect(byId['airing-this-season']!.filter((p) => news.has(p))).toEqual([]);
  const top = new Set(byId['top-10-today']);
  expect(byId['hero']!.some((p) => top.has(p))).toBe(true);
});

test('cards show name, episode label and rating', async ({ page }) => {
  await page.goto('/?transport=replay');
  const card = page
    .getByTestId('shelf:new-episodes')
    .getByTestId('card:/phim/ushiro-no-shoumen-kamui-san-a6084/');

  await expect(card).toContainText('Ushiro no Shoumen Kamui-san');
  await expect(card).toContainText('TẬP19');
  await expect(card).toContainText('8.8');
  await expect(page.locator('body')).not.toContainText(/\bNaN\b/);
});

test('image requests are answered locally, never by the CDN', async ({
  page,
}) => {
  const cdnRequests: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).hostname === 'cdn.animevietsub.best')
      cdnRequests.push(req.url());
  });
  const failed: string[] = [];
  page.on('requestfailed', (req) => {
    if (req.url().includes('cdn.animevietsub.best')) failed.push(req.url());
  });

  await page.goto('/?transport=replay');
  await expect(page.getByTestId('shelf:airing-this-season')).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(cdnRequests.length).toBeGreaterThan(0);
  expect(failed).toEqual([]);
});

test('the season shelf shows its own loading state without blocking the rest', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/fixtures/default/season/**', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/?transport=replay');

  await expect(page.getByTestId('shelf:new-episodes')).toBeVisible();
  await expect(page.getByTestId('shelf:top-10-today')).toBeVisible();
  await expect(
    page.getByTestId('shelf:airing-this-season:loading'),
  ).toBeVisible();
  await expect(page.getByTestId('shelf:airing-this-season')).toHaveCount(0);

  release();
  await expect(page.getByTestId('shelf:airing-this-season')).toBeVisible();
  await expect(
    page.getByTestId('shelf:airing-this-season:loading'),
  ).toHaveCount(0);
});

test.describe('season request fails', () => {
  test.use({ allowedConsoleErrors: [/404/] });

  test('hides only the airing shelf', async ({ page }) => {
    await page.route('**/fixtures/default/season/**', (route) =>
      route.fulfill({ status: 404, body: '' }),
    );
    await page.goto('/?transport=replay');

    await expect(page.getByTestId('shelf:top-10-today')).toBeVisible();
    await expect(
      page.getByTestId('shelf:airing-this-season:loading'),
    ).toHaveCount(0);
    expect((await shelves(page)).map((s) => s.id)).toEqual([
      'hero',
      'new-episodes',
      'top-10-today',
    ]);
    await expect(page.getByTestId('error-screen')).toHaveCount(0);
  });
});

test('the shell navigates and exposes window.__app', async ({ page }) => {
  await page.goto('/?transport=replay');
  await expect(page.getByTestId('shelf:airing-this-season')).toBeVisible();

  for (const id of ['home', 'browse', 'schedule', 'rankings', 'my-list']) {
    await expect(page.getByTestId(`nav:${id}`)).toBeVisible();
  }
  expect(await page.evaluate(() => window.__app?.queryKeys())).toEqual(
    expect.arrayContaining([['home'], ['season', SEASON_PATH]]),
  );

  await page.getByTestId('nav:browse').click();
  await expect(page.getByTestId('page:Browse')).toBeVisible();
  expect(await page.evaluate(() => window.__app?.route())).toBe('/browse');
  expect(await shelves(page)).toEqual([]);
});
