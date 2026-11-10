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

const HERO_SLUG =
  'shinja-zero-no-megami-sama-to-hajimeru-isekai-kouryaku-a6137';

test('the home hero shows a TMDB backdrop for a stubbed slug and keeps the source image for the others', async ({
  page,
}) => {
  await page.route('**/image.tmdb.org/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: poster }),
  );
  const requested: string[] = [];
  await page.route('**/art.test/title_art*', (route) => {
    requested.push(route.request().url());
    return route.fulfill({
      json: [
        {
          source_slug: HERO_SLUG,
          backdrop_path: '/hero.jpg',
        },
      ],
    });
  });

  await page.goto('/?transport=replay');
  await expect(page.getByTestId('hero:slide:0').locator('img')).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/w1280/hero.jpg',
  );
  await expect(page.getByTestId('hero:slide:1').locator('img')).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.animevietsub\.best\//,
  );

  expect(requested.length).toBeGreaterThan(0);
  for (const url of requested) {
    expect(url).toContain('source_slug=in.');
    expect(decodeURIComponent(url)).toContain(`"${HERO_SLUG}"`);
  }
});

test.describe('a failing art API', () => {
  test.use({ allowedConsoleErrors: [/status of 500/] });

  test('keeps the source images on the home page', async ({ page }) => {
    await page.route('**/art.test/title_art*', (route) =>
      route.fulfill({ status: 500, body: 'nope' }),
    );
    await page.goto('/?transport=replay');
    await expect(
      page.getByTestId('hero:slide:0').locator('img'),
    ).toHaveAttribute('src', /^https:\/\/cdn\.animevietsub\.best\//);
  });
});
