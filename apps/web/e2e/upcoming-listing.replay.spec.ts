import type { Page } from '@playwright/test';
import type { LookupRequest } from '../../api/src/art/contract.ts';
import { expect, test, UPCOMING_NOW } from './fixtures.ts';

const LOOKUP = '**/api.test/v1/art/lookup';
const PAGE = '/upcoming?transport=replay';

const FIRST =
  'sekai-saikou-no-ansatsusha-isekai-kizoku-ni-tensei-suru-2nd-season-a6188';
const LAST =
  'tokidoki-bosotto-russia-go-de-dereru-tonari-no-alya-san-2nd-season-a5457';
const COUNTDOWN =
  'doukyo-shiteiru-kensei-no-onna-shishou-ga-kawaisugite-mainichi-shiawase-desu-a6174';
const BARE_YEAR = FIRST;

const TOTAL = 30 + 17;

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

const card = (page: Page, slug: string) =>
  page.getByTestId(`card:/phim/${slug}/`);

const current = (page: Page) =>
  page.locator('[data-testid^="listing:page:"][aria-current="page"]');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(UPCOMING_NOW);
});

test('the Xem tất cả link of the upcoming shelf lands on the listing', async ({
  page,
}) => {
  await stubLookup(page);
  await page.goto('/?transport=replay');
  const link = page.getByTestId('shelf:upcoming:see-all');
  await expect(link).toHaveAttribute('href', '/upcoming');
  await link.click();
  await expect(page).toHaveURL(/\/upcoming/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Sắp ra mắt',
  );
  await expect(cards(page)).toHaveCount(30);
});

test('lists every page of the source 30 at a time and reaches the last card', async ({
  page,
}) => {
  const bodies = await stubLookup(page);
  await page.goto(PAGE);
  await expect(cards(page)).toHaveCount(30);
  await expect(page.getByTestId('listing:count')).toContainText(`${TOTAL}`);
  await expect(page.getByTestId('listing:partial')).toHaveCount(0);
  expect(bodies.flatMap((b) => b.titles)).toHaveLength(TOTAL);

  expect((await order(page))[0]).toBe(FIRST);
  await page.getByTestId('listing:page:2').click();
  await expect(current(page)).toHaveText('2');
  const last = await order(page);
  expect(last).toHaveLength(TOTAL - 30);
  expect(last.at(-1)).toBe(LAST);
});

test('requests both pages of /anime-sap-chieu/', async ({ page }) => {
  await stubLookup(page);
  const requested: string[] = [];
  page.on('request', (req) => requested.push(new URL(req.url()).pathname));
  await page.goto(PAGE);
  await expect(cards(page)).toHaveCount(30);
  await expect(page.getByTestId('listing:page:2')).toBeEnabled();

  expect(requested).toContain('/fixtures/default/anime-sap-chieu.html');
  expect(requested).toContain('/fixtures/default/anime-sap-chieu/trang-2.html');
});

test('a timer card shows a countdown while a bare-year card shows its year under Sắp chiếu', async ({
  page,
}) => {
  await stubLookup(page);
  await page.goto(PAGE);
  await expect(cards(page)).toHaveCount(30);

  const timer = card(page, COUNTDOWN);
  await expect(timer.getByTestId('card:countdown')).toHaveText('Hôm nay');
  await expect(timer).toContainText('Sắp chiếu');

  const bare = card(page, BARE_YEAR);
  await expect(bare).toContainText('Sắp chiếu');
  await expect(bare.getByTestId('card:countdown')).toHaveText('2027');
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
  expect((await order(page))[0]).not.toBe(FIRST);
});

test('a direct URL opens that page', async ({ page }) => {
  await stubLookup(page);
  await page.goto(`${PAGE}&page=2`);
  await expect(current(page)).toHaveText('2');
  await expect(cards(page)).toHaveCount(TOTAL - 30);
  await expect(page.getByTestId('listing:next')).toBeDisabled();
});
