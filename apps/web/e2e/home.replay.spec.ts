import { expect, test } from './fixtures.ts';

test('home renders the fixture titles in replay mode', async ({ page }) => {
  await page.goto('/?transport=replay');

  const list = page.getByTestId('home:titles');
  await expect(list).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveText([
    /Psyren/,
    /Dragon Ball Super: Beerus/,
    /Synthetic Title Three/,
  ]);
  await expect(page.getByTestId('card:/phim/psyren-a1001/')).toContainText(
    '8.4',
  );
  await expect(page.getByTestId('error-screen')).toHaveCount(0);
});

test('the shell navigates and exposes window.__app', async ({ page }) => {
  await page.goto('/?transport=replay');
  await expect(page.getByTestId('home:titles')).toBeVisible();

  for (const id of ['home', 'browse', 'schedule', 'rankings', 'my-list']) {
    await expect(page.getByTestId(`nav:${id}`)).toBeVisible();
  }
  expect(await page.evaluate(() => window.__app?.queryKeys())).toEqual([
    ['home'],
  ]);

  await page.getByTestId('nav:browse').click();
  await expect(page.getByTestId('page:Browse')).toBeVisible();
  expect(await page.evaluate(() => window.__app?.route())).toBe('/browse');
});
