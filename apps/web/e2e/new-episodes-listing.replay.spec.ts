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
  await expect(page.getByTestId('listing:count')).toHaveText(`${TOTAL} phim`);
});

test('lists every page of the source 30 at a time and reaches the last card', async ({
  page,
}) => {
  const bodies = await stubLookup(page);
  await page.goto(PAGE);
  await expect(page.getByTestId('listing:count')).toHaveText(`${TOTAL} phim`);
  await expect(cards(page)).toHaveCount(30);
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
