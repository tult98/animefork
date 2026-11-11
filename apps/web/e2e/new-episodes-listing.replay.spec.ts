import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { LookupRequest } from '../../api/src/art/contract.ts';
import { expect, test } from './fixtures.ts';

const LOOKUP = '**/api.test/v1/art/lookup';
const PAGE = '/new-episodes?transport=replay';

const PSYREN = 'psyren-a6115';
const MOVIE = 'the-gioi-hoan-my-movie-cuu-kiep-phan-thien-a6075';

const TOTAL = 22 + 8 + 3;

async function stubLookup(page: Page) {
  const bodies: LookupRequest[] = [];
  await page.route(LOOKUP, (route) => {
    bodies.push(route.request().postDataJSON() as LookupRequest);
    return route.fulfill({ json: { art: {}, ratings: {} } });
  });
  return bodies;
}

const cards = (page: Page) =>
  page.getByTestId('listing:grid').getByRole('listitem');

const order = (page: Page) =>
  cards(page)
    .locator('[data-cover]')
    .evaluateAll((els) =>
      els.map((el) =>
        el
          .closest('[data-testid^="card:/phim/"]')!
          .getAttribute('data-testid')!
          .replace(/^card:\/phim\/|\/$/g, ''),
      ),
    );

const current = (page: Page) =>
  page.locator('[data-testid^="listing:page:"][aria-current="page"]');

test('the Xem tất cả link of the new episodes shelf lands on the listing', async ({
  page,
}) => {
  await stubLookup(page);
  await page.goto('/?transport=replay');
  await page.getByTestId('shelf:new-episodes:see-all').click();
  await expect(page).toHaveURL(/\/new-episodes/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Mới cập nhật',
  );
  await expect(cards(page)).toHaveCount(30);
});

test('lists every page of the source 30 at a time and reaches the last card', async ({
  page,
}) => {
  const bodies = await stubLookup(page);
  await page.goto(PAGE);
  await expect(cards(page)).toHaveCount(30);
  await expect(page.getByTestId('listing:count')).toHaveCount(0);
  await expect(page.getByTestId('listing:partial')).toHaveCount(0);
  expect(bodies.flatMap((b) => b.titles)).toHaveLength(TOTAL);

  expect((await order(page))[0]).toBe(PSYREN);
  await page.getByTestId('listing:page:2').click();
  await expect(current(page)).toHaveText('2');
  const last = await order(page);
  expect(last).toHaveLength(TOTAL - 30);
  expect(last.at(-1)).toBe(MOVIE);
});

test('every card carries the Tập mới badge', async ({ page }) => {
  await stubLookup(page);
  await page.goto(PAGE);
  await expect(cards(page)).toHaveCount(30);
  await expect(cards(page).filter({ hasText: 'Tập mới' })).toHaveCount(30);
});

test('sorting by views reorders the list and returns to page 1', async ({
  page,
}) => {
  await stubLookup(page);
  await page.goto(`${PAGE}&page=2`);
  await expect(current(page)).toHaveText('2');

  const trigger = page.getByTestId('listing:sort');
  await trigger.click();
  await page.getByTestId('listing:sort:option:views-desc').click();
  await expect(trigger).toHaveText('Xem nhiều nhất');
  await expect(page).toHaveURL(/sort=views-desc/);
  await expect(current(page)).toHaveText('1');
  expect((await order(page))[0]).not.toBe(PSYREN);
});

test('a direct URL opens that page', async ({ page }) => {
  await stubLookup(page);
  await page.goto(`${PAGE}&page=2`);
  await expect(current(page)).toHaveText('2');
  await expect(cards(page)).toHaveCount(TOTAL - 30);
  await expect(page.getByTestId('listing:next')).toBeDisabled();
});

const FIXTURES = resolve(import.meta.dirname, '../public/fixtures/default');
const CARD = /<li class="TPostMv">.*?<\/li>/s.exec(
  readFileSync(`${FIXTURES}/anime-moi.html`, 'utf8'),
)![0];
const SOURCE_PAGES = 200;
const PER_PAGE = 30;

function generatedPage(n: number) {
  const items = Array.from({ length: PER_PAGE }, (_, i) => {
    const id = (n - 1) * PER_PAGE + i + 1;
    return CARD.replaceAll('psyren-a6115', `gen-${id}-a${id}`).replaceAll(
      'Psyren',
      `Phim ${id}`,
    );
  });
  return `<html><body><ul class="MovieList">${items.join('')}</ul><div class="wp-pagenavi"><span class="pages">Trang ${n} của ${SOURCE_PAGES}</span></div></body></html>`;
}

async function serveLongSource(page: Page) {
  const requested: string[] = [];
  await page.route('**/fixtures/default/anime-moi.html', (route) => {
    requested.push('/anime-moi/');
    return route.fulfill({ body: generatedPage(1), contentType: 'text/plain' });
  });
  await page.route('**/fixtures/default/anime-moi/trang-*.html', (route) => {
    const n = Number(/trang-(\d+)\.html/.exec(route.request().url())![1]);
    requested.push(`/anime-moi/trang-${n}.html`);
    return route.fulfill({
      body: generatedPage(n),
      contentType: 'text/plain',
    });
  });
  return requested;
}

test.describe('a source with 200 pages', () => {
  test('lists the newest 200 titles over 7 pages and fetches only the pages they need', async ({
    page,
  }) => {
    await stubLookup(page);
    const requested = await serveLongSource(page);
    await page.goto(PAGE);
    await expect(cards(page)).toHaveCount(30);
    await expect(page.getByTestId('listing:count')).toHaveCount(0);
    await expect(page.getByTestId('listing:partial')).toHaveCount(0);
    await expect(page.getByTestId('listing:page:7')).toBeVisible();
    await expect(page.getByTestId('listing:page:8')).toHaveCount(0);

    expect(await order(page)).toEqual(
      Array.from({ length: 30 }, (_, i) => `gen-${i + 1}-a${i + 1}`),
    );
    await page.getByTestId('listing:page:7').click();
    await expect(current(page)).toHaveText('7');
    const last = await order(page);
    expect(last).toHaveLength(20);
    expect(last.at(-1)).toBe('gen-200-a200');

    expect([...new Set(requested)].sort()).toEqual(
      [
        '/anime-moi/',
        ...Array.from(
          { length: 6 },
          (_, i) => `/anime-moi/trang-${i + 2}.html`,
        ),
      ].sort(),
    );
  });

  test('sorting by views keeps the 200 titles and returns to page 1', async ({
    page,
  }) => {
    const bodies = await stubLookup(page);
    await serveLongSource(page);
    await page.goto(`${PAGE}&page=3`);
    await expect(current(page)).toHaveText('3');
    expect(bodies.flatMap((b) => b.titles)).toHaveLength(200);

    const trigger = page.getByTestId('listing:sort');
    await trigger.click();
    await page.getByTestId('listing:sort:option:views-desc').click();
    await expect(trigger).toHaveText('Xem nhiều nhất');
    await expect(current(page)).toHaveText('1');
    await expect(page.getByTestId('listing:page:7')).toBeVisible();
    await expect(page.getByTestId('listing:page:8')).toHaveCount(0);
  });
});
