import { expect, test } from './fixtures.ts';

const SEASON_PATH = '/season/autumn/2026/';

async function shelves(page: import('@playwright/test').Page) {
  return (await page.evaluate(() => window.__app?.shelves())) ?? [];
}

test('home renders the hero and the four shelves in order', async ({
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
    'upcoming',
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
  expect(byId['upcoming']).toHaveLength(6);

  const news = new Set(byId['new-episodes']);
  expect(byId['airing-this-season']!.filter((p) => news.has(p))).toEqual([]);
  const top = new Set(byId['top-10-today']);
  expect(byId['hero']!.some((p) => top.has(p))).toBe(true);
});

test('a card is the art and its badge, with the details in the accessible name', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  const card = page
    .getByTestId('shelf:new-episodes')
    .getByTestId('card:/phim/ushiro-no-shoumen-kamui-san-a6084/');

  await expect(
    card.getByRole('button', { name: 'Ushiro no Shoumen Kamui-san, Tập 19' }),
  ).toBeVisible();
  await expect(card).toContainText('Tập mới');
  await expect(card).toContainText('Tập 19');
  await expect(card).not.toContainText('Ushiro no Shoumen Kamui-san');
  await expect(card).not.toContainText('8.8');
  await expect(page.locator('body')).not.toContainText(/\bNaN\b/);
});

test('a card opens the details modal instead of a page', async ({ page }) => {
  await page.goto('/?transport=replay');
  await page
    .getByTestId('shelf:new-episodes')
    .getByTestId('card:/phim/ushiro-no-shoumen-kamui-san-a6084/')
    .locator('[data-cover]')
    .click();

  const modal = page.getByTestId('details');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { level: 2 })).toHaveText(
    'Ushiro no Shoumen Kamui-san',
  );
  await expect(page).toHaveURL(/\/\?transport=replay$/);
  await expect(modal.getByTestId('details:play')).toHaveAttribute(
    'href',
    '/watch/ushiro-no-shoumen-kamui-san-a6084',
  );
  await expect(modal.getByTestId('details:episode:81001')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});

test('the details modal switches season and plays an episode', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  await page
    .getByTestId('shelf:new-episodes')
    .getByTestId('card:/phim/ushiro-no-shoumen-kamui-san-a6084/')
    .locator('[data-cover]')
    .click();
  const modal = page.getByTestId('details');
  await expect(modal.getByTestId('details:episode:81001')).toBeVisible();

  await modal.getByTestId('details:season-button').click();
  await modal
    .getByTestId('details:season:tonikaku-kawaii-2nd-season-a4476')
    .click();
  await expect(modal.getByTestId('details:episode:81001')).toHaveCount(0);
  await expect(
    modal.getByTestId('details:episodes').getByRole('link').first(),
  ).toBeVisible();

  await modal.getByTestId('details:episodes').getByRole('link').first().click();
  await expect(page).toHaveURL(/\/watch\/tonikaku-kawaii-2nd-season-a4476\//);
  await expect(page.getByTestId('details')).toHaveCount(0);
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

test('home shows the hero and shelf skeletons while loading', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/fixtures/default/index.html', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/?transport=replay');

  const loading = page.getByTestId('home:loading');
  await expect(loading).toBeVisible();
  await expect(loading.locator('[aria-busy="true"]')).toHaveCount(3);
  await expect(page.getByTestId('hero')).toHaveCount(0);

  release();
  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(loading).toHaveCount(0);
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
      'upcoming',
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

test('a long description in the details modal is clamped and expands on click', async ({
  page,
}) => {
  await page.route('**/api.test/**', (route) =>
    route.fulfill({
      json: {
        art: {
          'ushiro-no-shoumen-kamui-san-a6084': {
            status: 'ready',
            backdropPath: null,
            backdropLang: null,
            posterPath: null,
            overview: 'Một câu chuyện rất dài. '.repeat(40),
          },
        },
      },
    }),
  );
  await page.goto('/?transport=replay');
  await page
    .getByTestId('shelf:new-episodes')
    .getByTestId('card:/phim/ushiro-no-shoumen-kamui-san-a6084/')
    .locator('[data-cover]')
    .click();
  const modal = page.getByTestId('details');
  const text = modal.getByTestId('details:description');
  const toggle = modal.getByTestId('details:description-toggle');
  const height = () => text.evaluate((el) => el.clientHeight);

  const clamped = await height();
  await expect(toggle).toHaveText('Xem thêm');
  await toggle.click();
  await expect(toggle).toHaveText('Thu gọn');
  expect(await height()).toBeGreaterThan(clamped);
  await toggle.click();
  expect(await height()).toBe(clamped);
});

test('the upcoming shelf shows countdown tags, soonest first, without a see-all link', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  const shelf = page.getByTestId('shelf:upcoming');
  await expect(shelf).toBeVisible();
  await expect(shelf).toHaveAttribute('aria-label', 'Sắp ra mắt');
  await expect(shelf.getByTestId('shelf:upcoming:see-all')).toHaveCount(0);

  const tags = shelf.getByTestId('card:countdown');
  await expect(tags).toHaveCount(6);
  const year = new Date().getFullYear();
  const texts = await tags.allTextContents();
  expect(texts.slice(0, 4)).toEqual([
    'Hôm nay',
    'Còn 5 ngày',
    'Còn 2 tuần',
    'Còn 3 tháng',
  ]);
  expect(texts[4]).toMatch(/^20\d\d$/);
  expect(Number(texts[4])).toBeGreaterThan(year);
  expect(texts[5]).toBe('2099');
  await expect(
    page.getByTestId('shelf:new-episodes').getByTestId('card:countdown'),
  ).toHaveCount(0);
});

// The fixture has no watch page for the made-up upcoming titles, so the details fetch 404s.
test.describe('upcoming card details', () => {
  test.use({ allowedConsoleErrors: [/404/] });

  test('an upcoming card still opens the details modal', async ({ page }) => {
    await page.goto('/?transport=replay');
    const card = page
      .getByTestId('shelf:upcoming')
      .getByTestId('card:/phim/tsuki-no-sakamichi-a7001/');
    await expect(card.locator('[data-cover]')).toHaveAttribute(
      'aria-label',
      'Tsuki no Sakamichi, PV/12, Hôm nay',
    );
    await card.locator('[data-cover]').click();

    const modal = page.getByTestId('details');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { level: 2 })).toHaveText(
      'Tsuki no Sakamichi',
    );
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
  });
});
