import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import type { ArtEntry, LookupRequest } from '../../api/src/art/contract.ts';
import { expect, test } from './fixtures.ts';

const HERO_SLUG =
  'shinja-zero-no-megami-sama-to-hajimeru-isekai-kouryaku-a6137';
const LOOKUP = '**/api.test/v1/art/lookup';
const LISTING = '/airing-this-season?transport=replay';
const SOURCE = /^https:\/\/cdn\.animevietsub\.best\//;
const poster = readFileSync(
  resolve(import.meta.dirname, '../public/fixtures/poster.svg'),
);

const readyAll = (body: LookupRequest): Record<string, ArtEntry> =>
  Object.fromEntries(
    body.titles.map((t) => [
      t.slug,
      {
        status: 'ready',
        backdropPath: `/${t.slug}.jpg`,
        backdropLang: 'vi',
        posterPath: `/${t.slug}-p.jpg`,
      },
    ]),
  );

// Answers the lookup only once release() is called, so the page is held in its waiting state.
async function holdLookup(
  page: Page,
  answer: (body: LookupRequest, call: number) => Record<string, ArtEntry>,
) {
  await page.route('**/image.tmdb.org/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: poster }),
  );
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let calls = 0;
  await page.route(LOOKUP, async (route: Route) => {
    const call = ++calls;
    const body = route.request().postDataJSON() as LookupRequest;
    await gate;
    await route.fulfill({ json: { art: answer(body, call) } });
  });
  return {
    calls: () => calls,
    release: () => open(),
  };
}

// Records every moment an img showing a source-site image sits inside the watched selector.
async function watchSourceImages(page: Page, selector: string) {
  await page.addInitScript(
    ([sel, source]) => {
      const seen: string[] = [];
      (window as unknown as { __sourceSeen: string[] }).__sourceSeen = seen;
      const scan = () => {
        for (const img of document.querySelectorAll<HTMLImageElement>(
          `${sel} img`,
        )) {
          const src = img.getAttribute('src') ?? '';
          if (src.startsWith(source)) seen.push(src);
        }
      };
      new MutationObserver(scan).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src'],
      });
    },
    [selector, 'https://cdn.animevietsub.best/'] as const,
  );
  return {
    seen: () =>
      page.evaluate(
        () => (window as unknown as { __sourceSeen: string[] }).__sourceSeen,
      ),
  };
}

test('a held lookup shows skeletons, then only TMDB art, with no source image in between', async ({
  page,
}) => {
  const watcher = await watchSourceImages(
    page,
    '[data-testid^="hero:slide"], [data-testid^="card:/phim/"]',
  );
  const lookup = await holdLookup(page, readyAll);

  await page.goto('/?transport=replay');
  await expect(page.getByTestId('hero:art-skeleton').first()).toBeVisible();
  const shelf = page.getByTestId('shelf:new-episodes');
  await expect(shelf.getByTestId('card:art-skeleton').first()).toBeVisible();
  await expect(shelf.locator('img')).toHaveCount(0);
  await expect(page.getByTestId('hero:slide:0').locator('img')).toHaveCount(0);

  const cover = shelf.locator('[data-cover]').first();
  await expect(cover).toHaveAttribute('aria-label', /.+/);
  await cover.hover();
  const preview = page.locator('[data-testid$=":preview"]');
  await expect(preview.getByTestId('card:art-skeleton')).toBeVisible();
  await expect(preview.locator('img')).toHaveCount(0);
  await page.mouse.move(5, 5);

  lookup.release();
  await expect(page.getByTestId('hero:slide:0').locator('img')).toHaveAttribute(
    'src',
    `https://image.tmdb.org/t/p/original/${HERO_SLUG}.jpg`,
  );
  await expect(page.getByTestId('hero:art-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('card:art-skeleton')).toHaveCount(0);
  await expect(shelf.locator('img').first()).toHaveAttribute(
    'src',
    /^https:\/\/image\.tmdb\.org\/t\/p\/w780\//,
  );
  expect(await watcher.seen()).toEqual([]);
});

test('pending then ready on a poll keeps the skeleton and never shows the source image', async ({
  page,
}) => {
  await page.clock.install();
  const watcher = await watchSourceImages(page, '[data-testid="hero:slide:0"]');
  await page.route('**/image.tmdb.org/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: poster }),
  );
  let isReady = false;
  let calls = 0;
  await page.route(LOOKUP, (route) => {
    calls++;
    const body = route.request().postDataJSON() as LookupRequest;
    return route.fulfill({
      json: {
        art: isReady ? readyAll(body) : { [HERO_SLUG]: { status: 'pending' } },
      },
    });
  });

  await page.goto('/?transport=replay');
  const slide = page.getByTestId('hero:slide:0');
  await expect.poll(() => calls).toBeGreaterThan(0);
  await expect(slide.getByTestId('hero:art-skeleton')).toBeVisible();
  await expect(slide.locator('img')).toHaveCount(0);

  isReady = true;
  await page.clock.fastForward(3000);
  await expect(slide.locator('img')).toHaveAttribute(
    'src',
    `https://image.tmdb.org/t/p/original/${HERO_SLUG}.jpg`,
  );
  expect(await watcher.seen()).toEqual([]);
});

test('a title the answer calls none shows the source image at once', async ({
  page,
}) => {
  await page.route(LOOKUP, (route) =>
    route.fulfill({ json: { art: { [HERO_SLUG]: { status: 'none' } } } }),
  );
  await page.goto('/?transport=replay');
  await expect(page.getByTestId('hero:slide:0').locator('img')).toHaveAttribute(
    'src',
    SOURCE,
  );
  await expect(page.getByTestId('hero:art-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('card:art-skeleton')).toHaveCount(0);
});

test.describe('a failing lookup', () => {
  test.use({ allowedConsoleErrors: [/status of 500/] });

  test('ends the skeletons and shows the source images', async ({ page }) => {
    await page.route(LOOKUP, (route) =>
      route.fulfill({ status: 500, body: 'nope' }),
    );
    await page.goto('/?transport=replay');
    await expect(
      page.getByTestId('hero:slide:0').locator('img'),
    ).toHaveAttribute('src', SOURCE);
    await expect(
      page.getByTestId('shelf:new-episodes').locator('img').first(),
    ).toHaveAttribute('src', SOURCE);
    await expect(page.getByTestId('hero:art-skeleton')).toHaveCount(0);
    await expect(page.getByTestId('card:art-skeleton')).toHaveCount(0);
  });
});

// Steps the page clock in 3s jumps until the poll budget (3s, 6s and 12s) is spent and the skeleton gives way.
async function spendPollBudget(page: Page, settled: () => Promise<void>) {
  const slow = page
    .getByTestId('card:art-skeleton')
    .or(page.getByTestId('hero:art-skeleton'));
  await expect(slow.first()).toBeVisible();
  await expect(async () => {
    await page.clock.fastForward(3000);
    await settled();
  }).toPass({ timeout: 20_000 });
}

test('a title still pending after the last poll falls back to the source image', async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  await page.route(LOOKUP, (route) => {
    calls++;
    return route.fulfill({
      json: { art: { [HERO_SLUG]: { status: 'pending' } } },
    });
  });

  await page.goto('/?transport=replay');
  const hero = page.getByTestId('hero:slide:0');
  await spendPollBudget(page, () =>
    expect(hero.locator('img')).toHaveAttribute('src', SOURCE, {
      timeout: 500,
    }),
  );
  await expect(page.getByTestId('hero:art-skeleton')).toHaveCount(0);
  const spent = calls;
  await page.clock.fastForward(60_000);
  await page.waitForTimeout(500);
  expect(calls).toBe(spent);
});

test('the listing waits on a held lookup, then shows only TMDB art', async ({
  page,
}) => {
  const watcher = await watchSourceImages(page, '[data-testid="listing:grid"]');
  const lookup = await holdLookup(page, readyAll);

  await page.goto(LISTING);
  const grid = page.getByTestId('listing:grid');
  await expect(grid.getByTestId('card:art-skeleton').first()).toBeVisible();
  await expect(grid.locator('img')).toHaveCount(0);
  await expect(grid.locator('[data-cover]').first()).toHaveAttribute(
    'aria-label',
    /.+/,
  );

  await expect.poll(lookup.calls).toBe(1);
  lookup.release();
  await expect(grid.locator('img').first()).toHaveAttribute(
    'src',
    /^https:\/\/image\.tmdb\.org\/t\/p\/w780\//,
  );
  await expect(page.getByTestId('card:art-skeleton')).toHaveCount(0);
  expect(await watcher.seen()).toEqual([]);
});

test('the listing falls back to the source image once the poll budget is spent', async ({
  page,
}) => {
  await page.clock.install();
  await page.route(LOOKUP, (route) =>
    route.fulfill({
      json: {
        art: Object.fromEntries(
          (route.request().postDataJSON() as LookupRequest).titles.map((t) => [
            t.slug,
            { status: 'pending' },
          ]),
        ),
      },
    }),
  );

  await page.goto(LISTING);
  const grid = page.getByTestId('listing:grid');
  await spendPollBudget(page, () =>
    expect(grid.locator('img').first()).toHaveAttribute('src', SOURCE, {
      timeout: 500,
    }),
  );
  await expect(page.getByTestId('card:art-skeleton')).toHaveCount(0);
});
