import { expect, test } from './fixtures.ts';

const NAV_VI = [
  'Trang chủ',
  'Duyệt phim',
  'Lịch chiếu',
  'Xếp hạng',
  'Danh sách của tôi',
];
const NAV_EN = ['Home', 'Browse', 'Schedule', 'Rankings', 'My list'];
const NAV_IDS = ['home', 'browse', 'schedule', 'rankings', 'my-list'];

async function expectNav(
  page: import('@playwright/test').Page,
  labels: string[],
) {
  for (const [i, id] of NAV_IDS.entries()) {
    await expect(page.getByTestId(`nav:${id}`)).toHaveText(labels[i]!);
  }
}

test.describe('browser language with no match', () => {
  test.use({ locale: 'fr-FR' });

  test('defaults to Vietnamese', async ({ page }) => {
    await page.goto('/?transport=replay');
    await expect(page.getByTestId('home:titles')).toBeVisible();

    await expectNav(page, NAV_VI);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    expect(await page.evaluate(() => window.__app?.locale())).toBe('vi');
  });
});

test.describe('English browser', () => {
  test.use({ locale: 'en-US' });

  test('follows navigator.language', async ({ page }) => {
    await page.goto('/?transport=replay');
    await expectNav(page, NAV_EN);
  });
});

test('the switcher moves vi to en, formats the rating, and persists', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  await expectNav(page, NAV_VI);
  await expect(page.getByTestId('card:/phim/psyren-a1001/')).toContainText(
    '8,4',
  );

  await page.getByTestId('lang:switch').click();
  await page.getByTestId('lang:option:en').click();

  await expectNav(page, NAV_EN);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => window.__app?.locale())).toBe('en');
  await expect(page.getByTestId('card:/phim/psyren-a1001/')).toContainText(
    '8.4',
  );

  await page.reload();
  await expectNav(page, NAV_EN);
});

test('?lang= overrides a stored choice', async ({ page }) => {
  await page.goto('/?transport=replay&lang=en');
  await page.getByTestId('lang:switch').click();
  await page.getByTestId('lang:option:vi').click();
  await expectNav(page, NAV_VI);

  await page.goto('/?transport=replay&lang=en');
  await expectNav(page, NAV_EN);
});

test('the error screen follows the language', async ({ page }) => {
  await page.goto('/?transport=replay&fixtures=invalid-title&lang=en');
  await expect(page.getByTestId('error:retry')).toHaveText('Retry');

  await page.getByTestId('lang:switch').click();
  await page.getByTestId('lang:option:vi').click();
  await expect(page.getByTestId('error:retry')).toHaveText('Thử lại');
});
