import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from './fixtures.ts';

const SLUG = 'tonikaku-kawaii-a3860';
const poster = readFileSync(
  resolve(import.meta.dirname, '../public/fixtures/poster.svg'),
);

test('TMDB episode stills replace the source thumbnail where a still exists', async ({
  page,
}) => {
  await page.route('**/image.tmdb.org/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: poster }),
  );
  await page.route('**/art.test/title_art*', (route) =>
    route.fulfill({
      json: [
        {
          source_slug: SLUG,
          tmdb_id: 1,
          tmdb_season: 1,
          backdrop_path: '/backdrop.jpg',
          backdrop_lang: 'vi',
        },
      ],
    }),
  );
  await page.route('**/art.test/episode_art*', (route) => {
    expect(route.request().url()).toContain(`source_slug=eq.${SLUG}`);
    return route.fulfill({
      json: [{ source_slug: SLUG, episode_number: 3, still_path: '/e3.jpg' }],
    });
  });

  await page.goto(`/watch/${SLUG}?transport=replay`);
  await expect(page.getByTestId('player')).toBeVisible();
  await page.getByTestId('player:episodes').hover();
  await expect(page.getByTestId('player:episodes-panel')).toBeVisible();

  await page.getByTestId('episode:3:toggle').click();
  await expect(
    page.getByTestId('episode:3:play').locator('img'),
  ).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w300/e3.jpg');

  await page.getByTestId('episode:2:toggle').click();
  await expect(
    page.getByTestId('episode:2:play').locator('img'),
  ).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w1280/backdrop.jpg');
});
