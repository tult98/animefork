import type { Page } from '@playwright/test';
import type {
  LookupRequest,
  TitleRatings,
} from '../../api/src/art/contract.ts';
import { expect, test } from './fixtures.ts';

const LOOKUP = '**/api.test/v1/art/lookup';
const PAGE = '/airing-this-season?transport=replay';

const mal = (score: number | null): TitleRatings => ({
  mal: {
    id: 1,
    score,
    voters: null,
    rank: null,
    popularity: null,
    members: null,
    airing: null,
    episodes: null,
    startDate: null,
    startSeason: null,
  },
});

const PSYREN = 'psyren-a6115';
const BLACK_CLOVER = 'black-clover-2nd-season-a6073';
const AO_NO_HAKO = 'ao-no-hako-2nd-season-a6078';
const SHUIRO = 'shuiro-no-kamen-a6135';
const HOTARU = 'hotaru-no-yomeiri-a6134';
const TENSEI = 'tensei-kizoku-kantei-skill-de-nariagaru-3rd-season-a6077';
const KYOUFU = 'kyoufu-collector-a6136';
const DOUMO = 'doumo-suki-na-hito-ni-horegusuri-wo-irai-sareta-majo-desu-a6113';
const DRAGON_BALL = 'dragon-ball-super-beerus-a6000';
const SEITOKAI = 'seitokai-ni-mo-ana-wa-aru-a6109';
const KASHITA = 'kashita-maryoku-wa-revo-barai-de-kyousei-choushuu-a6103';
const TOKYO = 'tokyo-revengers-santen-sensou-hen-a6096';
const VERTEX = 'vertex-force-a6099';
const AO_ASHI = 'ao-ashi-2nd-season-a6104';
const CONAN = 'meitantei-conan-30-gou-satsujin-jiken-a6089';
const MOVIE = 'the-gioi-hoan-my-movie-cuu-kiep-phan-thien-a6075';

const RATINGS: Record<string, TitleRatings> = {
  [PSYREN]: mal(7.9),
  [BLACK_CLOVER]: mal(8.4),
  [AO_NO_HAKO]: mal(null),
  [SHUIRO]: mal(8.9),
  [HOTARU]: mal(7.0),
  [TENSEI]: mal(7.2),
  [KYOUFU]: mal(6.5),
};

const TOTAL = 22 + 8 + 3;
const PAGES = 2;

async function stubLookup(page: Page) {
  const bodies: LookupRequest[] = [];
  await page.route(LOOKUP, (route) => {
    bodies.push(route.request().postDataJSON() as LookupRequest);
    return route.fulfill({ json: { art: {}, ratings: RATINGS } });
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

async function pick(page: Page, value: string) {
  const trigger = page.getByTestId('listing:sort');
  await trigger.click();
  const option = page.getByTestId(`listing:sort:option:${value}`);
  const text = (await option.textContent())!;
  await option.click();
  await expect(trigger).toHaveText(text);
}

const current = (page: Page) =>
  page.locator('[data-testid^="listing:page:"][aria-current="page"]');

test('the Xem tất cả link of the season shelf lands on the listing', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  await page.getByTestId('shelf:airing-this-season:see-all').click();
  await expect(page).toHaveURL(/\/airing-this-season/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Đang chiếu mùa này',
  );
  await expect(page.getByTestId('listing:count')).toBeVisible();
});

test('counts every page of the season in the header and shows them 30 at a time', async ({
  page,
}) => {
  const bodies = await stubLookup(page);
  await page.goto(PAGE);
  await expect(page.getByTestId('listing:count')).toHaveText(
    `Mùa thu 2026 · ${TOTAL} phim`,
  );
  await expect(cards(page)).toHaveCount(30);
  await expect(page.getByTestId('listing:partial')).toHaveCount(0);
  expect(bodies.flatMap((b) => b.titles)).toHaveLength(TOTAL);

  expect((await order(page))[0]).toBe(PSYREN);
  await page.getByTestId('listing:page:2').click();
  await expect(current(page)).toHaveText('2');
  const last = await order(page);
  expect(last).toHaveLength(TOTAL - 30);
  expect(last.at(-1)).toBe(MOVIE);
  await expect(page.getByTestId('listing:count')).toHaveText(
    `Mùa thu 2026 · ${TOTAL} phim`,
  );
});

test.describe('the pager', () => {
  test.beforeEach(async ({ page }) => {
    await stubLookup(page);
    await page.goto(PAGE);
    await expect(cards(page)).toHaveCount(30);
  });

  test('has prev, next, numbered buttons and a summary', async ({ page }) => {
    const pager = page.getByRole('navigation', { name: 'Phân trang' });
    await expect(pager).toBeVisible();
    await expect(pager.getByRole('button')).toHaveCount(PAGES + 2);
    await expect(page.getByRole('button', { name: 'Trang 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('listing:prev')).toBeDisabled();
    await expect(page.getByTestId('listing:next')).toBeEnabled();
  });

  test('next and prev move one page and push history', async ({ page }) => {
    await page.getByTestId('listing:next').click();
    await expect(page).toHaveURL(/page=2/);
    await expect(current(page)).toHaveText('2');
    await expect(page.getByTestId('listing:next')).toBeDisabled();
    await expect(page.getByTestId('listing:prev')).toBeEnabled();

    await page.getByTestId('listing:prev').click();
    await expect(current(page)).toHaveText('1');
    await expect(page).not.toHaveURL(/page=/);

    await page.goBack();
    await expect(current(page)).toHaveText('2');
    await page.goBack();
    await expect(current(page)).toHaveText('1');
  });

  test('a numbered button jumps to its page and scrolls to the grid', async ({
    page,
  }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByTestId('listing:page:2').click();
    await expect(current(page)).toHaveText('2');
    await expect(cards(page)).toHaveCount(TOTAL - 30);
    const top = await page
      .getByTestId('listing:grid')
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(400);
  });

  test('changing the sort goes back to page 1 by replacing the entry', async ({
    page,
  }) => {
    await page.getByTestId('listing:page:2').click();
    await expect(current(page)).toHaveText('2');
    const before = await page.evaluate(() => history.length);

    await pick(page, 'score-desc');
    await expect(page).not.toHaveURL(/page=/);
    await expect(current(page)).toHaveText('1');
    expect((await order(page))[0]).toBe(AO_NO_HAKO);
    expect(await page.evaluate(() => history.length)).toBe(before);
  });
});

test('a direct URL opens that page', async ({ page }) => {
  await stubLookup(page);
  await page.goto(`${PAGE}&page=2`);
  await expect(current(page)).toHaveText('2');
  await expect(cards(page)).toHaveCount(TOTAL - 30);
  await expect(page.getByTestId('listing:next')).toBeDisabled();
});

test('a page past the end clamps to the last page', async ({ page }) => {
  await stubLookup(page);
  await page.goto(`${PAGE}&page=99`);
  await expect(current(page)).toHaveText('2');
  await expect(cards(page)).toHaveCount(TOTAL - 30);
});

test.describe('an old sort value', () => {
  for (const old of ['mal-asc', 'mal-desc', 'avs-asc', 'avs-desc']) {
    test(`${old} falls back to the default sort`, async ({ page }) => {
      await stubLookup(page);
      await page.goto(`${PAGE}&sort=${old}`);
      await expect(cards(page)).toHaveCount(30);
      await expect(page.getByTestId('listing:sort')).toHaveText('Tập mới nhất');
      expect((await order(page))[0]).toBe(PSYREN);
    });
  }
});

test('a bad page value falls back to page 1', async ({ page }) => {
  await stubLookup(page);
  await page.goto(`${PAGE}&page=-4&sort=az`);
  await expect(current(page)).toHaveText('1');
  await expect(page.getByTestId('listing:sort')).toHaveText('Tập mới nhất');
});

test.describe('sorts', () => {
  const head = async (page: Page, sort: string, count = 12) => {
    await pick(page, sort);
    await expect(page).toHaveURL(new RegExp(`sort=${sort}`));
    return (await order(page)).slice(0, count);
  };

  test.beforeEach(async ({ page }) => {
    await stubLookup(page);
    await page.goto(PAGE);
    await expect(cards(page)).toHaveCount(30);
  });

  test('Tập mới nhất is the upstream order', async ({ page }) => {
    expect((await order(page)).slice(0, 3)).toEqual([PSYREN, DOUMO, KYOUFU]);
  });

  test('score both ways blends AVS with MAL where MAL has a score', async ({
    page,
  }) => {
    expect(await head(page, 'score-desc', 3)).toEqual([
      AO_NO_HAKO,
      SEITOKAI,
      AO_ASHI,
    ]);
    expect(await head(page, 'score-asc', 7)).toEqual([
      MOVIE,
      KYOUFU,
      KASHITA,
      TOKYO,
      VERTEX,
      CONAN,
      TENSEI,
    ]);
  });

  test('most viewed and most voted', async ({ page }) => {
    expect(await head(page, 'views-desc', 3)).toEqual([
      BLACK_CLOVER,
      DRAGON_BALL,
      TENSEI,
    ]);
    expect(await head(page, 'voters-desc', 3)).toEqual([
      BLACK_CLOVER,
      SEITOKAI,
      DRAGON_BALL,
    ]);
  });

  test('the preview shows the AVS and MAL scores on every sort', async ({
    page,
  }) => {
    const body = async (id: string) => {
      await page.mouse.move(0, 0);
      await page.getByTestId(`card:/phim/${id}/`).hover();
      const preview = page.getByTestId(`card:/phim/${id}/:body`);
      await expect(preview).toContainText('AVS');
      return preview;
    };
    const both = async (id: string, avs: string, malScore: string) => {
      const preview = await body(id);
      await expect(preview).toContainText(`${avs}AVS`);
      await expect(preview).toContainText(`${malScore}MAL`);
    };
    await both(PSYREN, '8.4', '7.90');
    await pick(page, 'score-desc');
    const unscored = await body(AO_NO_HAKO);
    await expect(unscored).toContainText('9.5AVS');
    await expect(unscored).not.toContainText('MAL');
    await pick(page, 'score-asc');
    await both(KYOUFU, '5.7', '6.50');
    await pick(page, 'views-desc');
    await both(BLACK_CLOVER, '9.6', '8.40');
  });
});

test('the dropdowns write the URL by replacing history, and a reload keeps them', async ({
  page,
}) => {
  await stubLookup(page);
  await page.goto(PAGE);
  await expect(cards(page)).toHaveCount(30);
  const before = await page.evaluate(() => history.length);

  await pick(page, 'score-asc');
  await expect(page).toHaveURL(/sort=score-asc/);
  await expect(page).toHaveURL(/transport=replay/);
  expect(await page.evaluate(() => history.length)).toBe(before);

  await page.reload();
  await expect(page.getByTestId('listing:sort')).toHaveText(
    'Điểm: thấp đến cao',
  );
  await expect(cards(page)).toHaveCount(30);
  expect((await order(page))[0]).toBe(MOVIE);

  await pick(page, 'recent');
  await expect(page).not.toHaveURL(/sort=/);
});

test('the control waits for every season page and the count waits with them', async ({
  page,
}) => {
  await stubLookup(page);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/season/autumn/2026/trang-2.html', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(PAGE);
  await expect(cards(page)).toHaveCount(22);
  await expect(page.getByTestId('listing:sort')).toBeDisabled();
  await expect(page.getByTestId('listing:pager')).toHaveCount(0);
  await expect(page.getByTestId('listing:count')).toHaveCount(0);

  release();
  await expect(cards(page)).toHaveCount(30);
  await expect(page.getByTestId('listing:next')).toBeEnabled();
  await expect(page.getByTestId('listing:count')).toHaveText(
    `Mùa thu 2026 · ${TOTAL} phim`,
  );
});

test.describe('with the lookup failing', () => {
  test.use({ allowedConsoleErrors: [/Failed to load resource/] });

  test('the page lists the scraped season', async ({ page }) => {
    await page.route(LOOKUP, (route) => route.abort());
    await page.goto(PAGE);
    await expect(page.getByTestId('listing:count')).toHaveText(
      `Mùa thu 2026 · ${TOTAL} phim`,
    );
    await expect(cards(page)).toHaveCount(30);

    await pick(page, 'score-desc');
    expect((await order(page))[0]).toBe(BLACK_CLOVER);
  });
});

test.describe('a later season page that fails', () => {
  test.use({ allowedConsoleErrors: [/Failed to load resource/] });

  test('keeps the pages it has and says the list is incomplete', async ({
    page,
  }) => {
    await stubLookup(page);
    await page.route('**/season/autumn/2026/trang-2.html', (route) =>
      route.fulfill({ status: 500, body: 'no' }),
    );
    await page.goto(PAGE);
    await expect(page.getByTestId('listing:partial')).toHaveText(
      'Chưa tải hết danh sách.',
    );
    await expect(page.getByTestId('listing:count')).toHaveText(
      `Mùa thu 2026 · ${22 + 3} phim`,
    );
    await expect(page.getByTestId('error-screen')).toHaveCount(0);
  });
});

test.describe('the sort dropdown', () => {
  const OPTIONS = 5;
  const trigger = (page: Page) => page.getByTestId('listing:sort');
  const option = (page: Page, value: string) =>
    page.getByTestId(`listing:sort:option:${value}`);

  test.beforeEach(async ({ page }) => {
    await stubLookup(page);
    await page.goto(PAGE);
    await expect(cards(page)).toHaveCount(30);
  });

  test('opens on click, exposes menu semantics and closes on Escape', async ({
    page,
  }) => {
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Sắp xếp Tập mới nhất' }),
    ).toBeVisible();

    await trigger(page).click();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitemradio')).toHaveCount(OPTIONS);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger(page)).toBeFocused();
  });

  test('closes on an outside click without changing anything', async ({
    page,
  }) => {
    await trigger(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.mouse.click(700, 500);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger(page)).toHaveText('Tập mới nhất');
    await expect(page).not.toHaveURL(/sort=/);
  });

  test('closes when an option is picked and moves the check', async ({
    page,
  }) => {
    await trigger(page).click();
    const recent = option(page, 'recent');
    const views = option(page, 'views-desc');
    await expect(recent).toHaveAttribute('aria-checked', 'true');
    await expect(recent.locator('svg')).toHaveCount(1);
    await expect(views).toHaveAttribute('aria-checked', 'false');
    await expect(views.locator('svg')).toHaveCount(0);

    await views.click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger(page)).toHaveText('Xem nhiều nhất');
    await expect(trigger(page)).toBeFocused();

    await trigger(page).click();
    await expect(views).toHaveAttribute('aria-checked', 'true');
    await expect(views.locator('svg')).toHaveCount(1);
    await expect(recent).toHaveAttribute('aria-checked', 'false');
  });

  test('focuses the selected option on open and moves with the arrows', async ({
    page,
  }) => {
    await page.goto(`${PAGE}&sort=score-desc`);
    await expect(cards(page)).toHaveCount(30);
    await trigger(page).click();
    await expect(option(page, 'score-desc')).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(option(page, 'score-asc')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(option(page, 'score-desc')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(option(page, 'recent')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(option(page, 'voters-desc')).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    await expect(option(page, 'voters-desc')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page).toHaveURL(/sort=voters-desc/);
    await expect(trigger(page)).toBeFocused();
  });

  test('closes on Tab and returns focus to the trigger', async ({ page }) => {
    await trigger(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test('stays disabled and closed while the list loads', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/season/autumn/2026/trang-3.html', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(PAGE);
    await expect(trigger(page)).toBeDisabled();
    await trigger(page).click({ force: true });
    await expect(page.getByRole('menu')).toHaveCount(0);
    release();
    await expect(trigger(page)).toBeEnabled();
  });

  test('stays inside a 390px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await trigger(page).click();
    const box = await page.getByRole('menu').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });
});

test.describe('the grid layout', () => {
  const measure = (page: Page) =>
    page.getByTestId('listing:grid').evaluate((grid) => {
      const style = getComputedStyle(grid);
      const first = grid.firstElementChild!.getBoundingClientRect();
      const cover = grid.querySelector('[data-cover]')!.getBoundingClientRect();
      return {
        columns: style.gridTemplateColumns.split(' ').length,
        rowGap: parseFloat(style.rowGap),
        columnGap: parseFloat(style.columnGap),
        card: first.width,
        ratio: cover.width / cover.height,
      };
    });

  for (const [width, columns] of [
    [1440, 6],
    [1100, 6],
    [1000, 3],
    [768, 3],
    [390, 2],
  ] as const) {
    test(`has ${columns} columns at ${width}px`, async ({ page }) => {
      await stubLookup(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(PAGE);
      await expect(cards(page)).toHaveCount(30);
      const m = await measure(page);
      expect(m.columns).toBe(columns);
      expect(m.columnGap).toBe(8);
      expect(m.ratio).toBeCloseTo(16 / 9, 1);
    });
  }

  test('sizes a card like the design at 1440px', async ({ page }) => {
    await stubLookup(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PAGE);
    await expect(cards(page)).toHaveCount(30);
    const m = await measure(page);
    expect(Math.abs(m.card - 213)).toBeLessThan(4);
  });
});
