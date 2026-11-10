import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import type { ArtEntry, LookupRequest } from '../../art-api/src/contract.ts';
import { expect, test } from './fixtures.ts';

const SLUG = 'tonikaku-kawaii-a3860';
const HERO_SLUG =
  'shinja-zero-no-megami-sama-to-hajimeru-isekai-kouryaku-a6137';
const LOOKUP = '**/art.test/v1/art/lookup';
const poster = readFileSync(
  resolve(import.meta.dirname, '../public/fixtures/poster.svg'),
);

async function stubArt(
  page: Page,
  answer: (body: LookupRequest, call: number) => Record<string, ArtEntry>,
): Promise<LookupRequest[]> {
  await page.route('**/image.tmdb.org/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: poster }),
  );
  const bodies: LookupRequest[] = [];
  await page.route(LOOKUP, (route: Route) => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON() as LookupRequest;
    bodies.push(body);
    return route.fulfill({ json: { art: answer(body, bodies.length) } });
  });
  return bodies;
}

const ready = (backdropPath: string, stills?: Record<string, string>) =>
  ({
    status: 'ready',
    backdropPath,
    backdropLang: 'vi',
    ...(stills ? { stills } : {}),
  }) as const;

test('TMDB episode stills replace the source thumbnail where a still exists', async ({
  page,
}) => {
  const bodies = await stubArt(page, () => ({
    [SLUG]: ready('/backdrop.jpg', { '3': '/e3.jpg' }),
  }));

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

  expect(bodies[0]).toEqual({
    titles: [{ slug: SLUG, name: 'Tonikaku Kawaii' }],
    episodes: true,
  });
});

test('the watch page swaps in the stills once a pending title is ready', async ({
  page,
}) => {
  const bodies = await stubArt(page, (_, call) => ({
    [SLUG]:
      call === 1 ? { status: 'pending' } : ready('/b.jpg', { '3': '/e3.jpg' }),
  }));

  await page.goto(`/watch/${SLUG}?transport=replay`);
  await expect(page.getByTestId('player')).toBeVisible();
  await page.getByTestId('player:episodes').hover();
  await page.getByTestId('episode:3:toggle').click();
  await expect(
    page.getByTestId('episode:3:play').locator('img'),
  ).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w300/e3.jpg', {
    timeout: 10_000,
  });
  expect(bodies).toHaveLength(2);
});

test('the home hero shows a TMDB backdrop for a stubbed slug and keeps the source image for the others', async ({
  page,
}) => {
  const bodies = await stubArt(page, () => ({
    [HERO_SLUG]: ready('/hero.jpg'),
  }));

  await page.goto('/?transport=replay');
  await expect(page.getByTestId('hero:slide:0').locator('img')).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/w1280/hero.jpg',
  );
  await expect(page.getByTestId('hero:slide:1').locator('img')).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.animevietsub\.best\//,
  );

  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) {
    expect(body.episodes).toBeUndefined();
    expect(body.titles.length).toBeLessThanOrEqual(50);
    expect(body.titles.map((t) => t.slug)).toContain(HERO_SLUG);
  }
});

test('the home hero swaps in the backdrop after a pending answer, then stops polling', async ({
  page,
}) => {
  const bodies = await stubArt(page, (_, call) => ({
    [HERO_SLUG]: call === 1 ? { status: 'pending' } : ready('/late.jpg'),
  }));

  await page.goto('/?transport=replay');
  const hero = page.getByTestId('hero:slide:0').locator('img');
  await expect(hero).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.animevietsub\.best\//,
  );
  await expect(hero).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/w1280/late.jpg',
    { timeout: 10_000 },
  );
  const settled = bodies.length;
  await page.waitForTimeout(4_000);
  expect(bodies).toHaveLength(settled);
});

test.describe('a failing art API', () => {
  test.use({ allowedConsoleErrors: [/status of 500/] });

  test('keeps the source images on the home page', async ({ page }) => {
    await page.route(LOOKUP, (route) =>
      route.fulfill({ status: 500, body: 'nope' }),
    );
    await page.goto('/?transport=replay');
    await expect(
      page.getByTestId('hero:slide:0').locator('img'),
    ).toHaveAttribute('src', /^https:\/\/cdn\.animevietsub\.best\//);
  });
});
