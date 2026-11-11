import { expect, test } from './fixtures.ts';

test('without VITE_API_URL no card or hero slide waits, and nothing calls the lookup', async ({
  page,
}) => {
  const lookups: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/v1/art/lookup')) lookups.push(req.url());
  });

  await page.goto('/?transport=replay');
  await expect(page.getByTestId('hero:slide:0').locator('img')).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.animevietsub\.best\//,
  );
  await expect(page.getByTestId('shelf:new-episodes')).toBeVisible();
  await expect(page.getByTestId('hero:art-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('card:art-skeleton')).toHaveCount(0);

  await page.goto('/airing-this-season?transport=replay');
  await expect(page.getByTestId('listing:grid')).toBeVisible();
  await expect(page.getByTestId('card:art-skeleton')).toHaveCount(0);
  expect(lookups).toEqual([]);
});
