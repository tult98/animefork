import { expect, test } from './fixtures.ts';

test('a zod-invalid fixture shows the error screen, not garbage', async ({
  page,
}) => {
  await page.goto('/?transport=replay&fixtures=invalid-title');

  await expect(page.getByTestId('error-screen')).toBeVisible();
  await expect(page.getByTestId('home:titles')).toHaveCount(0);
  await expect(page.getByText('NaN')).toHaveCount(0);
});

test('the error screen card keeps its max-w-md width', async ({ page }) => {
  await page.goto('/?transport=replay&fixtures=invalid-title');

  const box = await page.getByTestId('error-screen').boundingBox();
  expect(box?.width).toBeGreaterThan(300);
});

test.describe('unreachable source', () => {
  test.use({ allowedConsoleErrors: [/503/] });

  test('shows the error screen and retry reaches the source again', async ({
    page,
  }) => {
    let reachable = false;
    await page.route('**/fixtures/default/index.html', (route) =>
      reachable ? route.continue() : route.fulfill({ status: 503, body: '' }),
    );
    await page.goto('/?transport=replay');

    await expect(page.getByTestId('error-screen')).toBeVisible();

    reachable = true;
    await page.getByTestId('error:retry').click();
    await expect(page.getByTestId('home:titles')).toBeVisible();
    await expect(page.getByTestId('error-screen')).toHaveCount(0);
  });
});
