import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const NEW_EPISODES = 'shelf:new-episodes';
const KAMUI = 'card:/phim/ushiro-no-shoumen-kamui-san-a6084/';

test('top 10 draws the rank numerals 1 to 10', async ({ page }) => {
  await page.goto('/?transport=replay');
  const shelf = page.getByTestId('shelf:top-10-today');
  await expect(shelf).toBeVisible();

  const items = shelf.getByRole('listitem');
  await expect(items).toHaveCount(10);
  const numerals = await items.evaluateAll((els) =>
    els.map((el) => el.querySelector('[aria-hidden="true"]')?.textContent),
  );
  expect(numerals).toEqual(
    Array.from({ length: 10 }, (_, index) => String(index + 1)),
  );
  await expect(items.first().locator('[data-cover]')).toHaveAttribute(
    'aria-label',
    /^Hạng 1: Black Clover 2nd Season/,
  );
});

test('only the new episodes shelf shows the Tập mới badge', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  await expect(page.getByTestId('shelf:airing-this-season')).toBeVisible();

  const card = page
    .getByTestId(NEW_EPISODES)
    .getByTestId('card:/phim/ushiro-no-shoumen-kamui-san-a6084/');
  await expect(card).toContainText('Tập mới');
  await expect(card).toContainText('Tập 19');
  await expect(page.getByTestId('shelf:top-10-today')).not.toContainText(
    'Tập mới',
  );
  await expect(page.getByTestId('shelf:airing-this-season')).not.toContainText(
    'Tập mới',
  );
});

test('Xem tất cả links to the listing page of its shelf, or /browse', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  const targets: Record<string, string> = {
    'new-episodes': '/new-episodes',
    'top-10-today': '/browse',
    'airing-this-season': '/airing-this-season',
    upcoming: '/browse',
  };
  for (const [id, href] of Object.entries(targets)) {
    await expect(page.getByTestId(`shelf:${id}:see-all`)).toHaveAttribute(
      'href',
      href,
    );
  }
});

test('ArrowRight moves focus to the next cover', async ({ page }) => {
  await page.goto('/?transport=replay');
  const covers = page.getByTestId(NEW_EPISODES).locator('[data-cover]');
  await covers.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(covers.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(covers.first()).toBeFocused();
});

const hoverRow = (page: Page, id: string) =>
  page
    .getByTestId(id)
    .locator('.shelf-rail')
    .hover({ position: { x: 600, y: 8 } });

test('the arrows scroll the shelf and the left arrow hides at the start', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  const left = page.getByTestId(`${NEW_EPISODES}:scroll-left`);
  const right = page.getByTestId(`${NEW_EPISODES}:scroll-right`);
  const scroller = page.getByTestId(NEW_EPISODES).getByRole('list');

  await hoverRow(page, NEW_EPISODES);
  await expect(left).toBeHidden();
  await expect(right).toHaveCSS('opacity', '1');
  await right.click();
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(300);
  await expect(left).toBeVisible();
  await expect(left).toHaveCSS('opacity', '1');
  await left.click();
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect(left).toBeHidden();
});

test('the arrows are 44px pills centred on the card art', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?transport=replay');
  for (const id of [NEW_EPISODES, 'shelf:top-10-today']) {
    await hoverRow(page, id);
    const arrowLocator = page.getByTestId(`${id}:scroll-right`);
    await expect(arrowLocator).toHaveCSS('opacity', '1');
    const art = await page
      .getByTestId(id)
      .locator('[data-cover] img')
      .first()
      .boundingBox();
    const arrow = await arrowLocator.boundingBox();
    expect(arrow!.width).toBeCloseTo(44, 0);
    expect(arrow!.height).toBeLessThanOrEqual(88.5);
    expect(arrow!.height).toBeLessThanOrEqual(art!.height + 0.5);
    const artMid = art!.y + art!.height / 2;
    expect(Math.abs(arrow!.y + arrow!.height / 2 - artMid)).toBeLessThan(2);
  }
});

test('the arrows are transparent until the row is hovered and fade out after', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?transport=replay');
  const right = page.getByTestId(`${NEW_EPISODES}:scroll-right`);
  await expect(page.getByTestId(NEW_EPISODES)).toBeVisible();
  await expect(right).toHaveCSS('opacity', '0');
  await expect(right).toHaveCSS('pointer-events', 'none');

  await hoverRow(page, NEW_EPISODES);
  await expect(right).toHaveCSS('opacity', '1');
  await expect(right).toHaveCSS('pointer-events', 'auto');

  await page.mouse.move(5, 5);
  await expect(right).toHaveCSS('opacity', '0');
});

test('the arrows show for keyboard focus on an arrow or a card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?transport=replay');
  const right = page.getByTestId(`${NEW_EPISODES}:scroll-right`);
  await expect(right).toHaveCSS('opacity', '0');

  await page.getByTestId(NEW_EPISODES).locator('[data-cover]').first().focus();
  await expect(right).toHaveCSS('opacity', '1');

  await page
    .getByTestId('shelf:top-10-today')
    .locator('[data-cover]')
    .first()
    .focus();
  await expect(right).toHaveCSS('opacity', '0');

  await right.focus();
  await expect(right).toHaveCSS('opacity', '1');
});

test('the hover preview opens after 250 ms and closes on leave', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/?transport=replay');
  const card = page
    .getByTestId(NEW_EPISODES)
    .getByTestId('card:/phim/ushiro-no-shoumen-kamui-san-a6084/');
  const preview = page.getByTestId(
    'card:/phim/ushiro-no-shoumen-kamui-san-a6084/:preview',
  );
  await expect(card).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 5_000));

  await card.locator('[data-cover]').hover();
  await page.clock.runFor(200);
  await expect(preview).toHaveCount(0);
  await page.clock.runFor(100);
  await expect(preview).toBeVisible();
  await expect(
    preview.getByRole('link', { name: 'Phát Ushiro no Shoumen Kamui-san' }),
  ).toBeVisible();
  await expect(
    preview.getByRole('button', {
      name: 'Xem chi tiết Ushiro no Shoumen Kamui-san',
    }),
  ).toBeVisible();
  await expect(preview).not.toContainText('Thêm vào danh sách');

  const box = (await preview.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(box.y).toBeGreaterThanOrEqual(8);

  await page.mouse.move(5, 5);
  await expect(preview).toHaveCount(0);
});

test('the preview opens, closes through a closing state and reopens on re-entry', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/?transport=replay');
  const card = page.getByTestId(NEW_EPISODES).getByTestId(KAMUI);
  const preview = page.getByTestId(`${KAMUI}:preview`);
  await expect(card).toBeVisible();
  await page.addStyleTag({
    content:
      ".card-preview[data-state='closing'] { transition-duration: 60s !important; }",
  });
  await page.clock.pauseAt(new Date(Date.now() + 5_000));

  await card.locator('[data-cover]').hover();
  await page.clock.runFor(300);
  await expect(preview).toHaveAttribute('data-state', 'open');
  await expect(preview).toHaveCSS('opacity', '1');

  await page.mouse.move(5, 5);
  await expect(preview).toHaveAttribute('data-state', 'closing');
  await expect(preview).toHaveCount(1);

  const box = (await preview.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 4);
  await expect(preview).toHaveAttribute('data-state', 'open');
  await page.clock.runFor(400);
  await expect(preview).toHaveAttribute('data-state', 'open');
  await expect(preview).toHaveCSS('opacity', '1');

  await page.mouse.move(5, 5);
  await expect(preview).toHaveAttribute('data-state', 'closing');
  await page.clock.runFor(400);
  await expect(preview).toHaveCount(0);
});

test('the preview unmounts when the closing transition ends', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  const preview = page.getByTestId(`${KAMUI}:preview`);
  await page
    .getByTestId(NEW_EPISODES)
    .getByTestId(KAMUI)
    .locator('[data-cover]')
    .hover();
  await expect(preview).toHaveAttribute('data-state', 'open');
  await page.mouse.move(5, 5);
  await expect(preview).toHaveCount(0);
});

test.describe('the preview closes when the page scrolls', () => {
  const cover = (page: Page) =>
    page.getByTestId(NEW_EPISODES).locator('[data-cover]').nth(3);
  const previewOf = (page: Page) => page.locator('[data-testid$=":preview"]');

  const openPreview = async (page: Page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?transport=replay');
    await cover(page).scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="shelf:new-episodes"]')!;
      window.scrollBy(
        0,
        el.getBoundingClientRect().top - window.innerHeight / 3,
      );
    });
    await expect
      .poll(async () => (await cover(page).boundingBox())!.y)
      .toBeLessThan(450);
    await cover(page).hover();
    const preview = previewOf(page);
    await expect(preview).toHaveAttribute('data-state', 'open');
    await expect(preview).toHaveCSS('opacity', '1');
    return page.getByTestId((await preview.getAttribute('data-testid'))!);
  };

  test('a page scroll closes the preview through the closing state', async ({
    page,
  }) => {
    const preview = await openPreview(page);
    await page.addStyleTag({
      content:
        ".card-preview[data-state='closing'] { transition-duration: 60s !important; }",
    });
    await page.mouse.wheel(0, 150);
    await expect(preview).toHaveAttribute('data-state', 'closing');
    await page.addStyleTag({
      content:
        ".card-preview[data-state='closing'] { transition-duration: 1ms !important; }",
    });
    await expect(preview).toHaveCount(0);
  });

  test('a shelf scroll closes the preview', async ({ page }) => {
    const preview = await openPreview(page);
    await page
      .getByTestId(NEW_EPISODES)
      .getByRole('list')
      .evaluate((el) => el.scrollBy(150, 0));
    await expect(preview).toHaveCount(0);
  });

  test('a card focused by the arrow keys still opens its preview after the scroll it causes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?transport=replay');
    const covers = page.getByTestId(NEW_EPISODES).locator('[data-cover]');
    const scroller = page.getByTestId(NEW_EPISODES).getByRole('list');
    await covers.first().focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await expect(covers.nth(8)).toBeFocused();
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    const preview = page.getByTestId(
      (await covers
        .nth(8)
        .locator('xpath=ancestor::*[@data-testid][1]')
        .getAttribute('data-testid'))! + ':preview',
    );
    await expect(preview).toHaveAttribute('data-state', 'open');
  });

  test('scroll listeners are balanced after repeated open and close', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const counts = { add: 0, remove: 0 };
      Object.assign(window, { scrollListeners: counts });
      const captured = (opts?: boolean | AddEventListenerOptions) =>
        typeof opts === 'object' ? !!opts.capture : !!opts;
      const add = window.addEventListener.bind(window);
      const remove = window.removeEventListener.bind(window);
      (window as Window).addEventListener = (
        type: string,
        fn: EventListenerOrEventListenerObject,
        opts?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'scroll' && captured(opts)) counts.add++;
        add(type, fn, opts);
      };
      (window as Window).removeEventListener = (
        type: string,
        fn: EventListenerOrEventListenerObject,
        opts?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'scroll' && captured(opts)) counts.remove++;
        remove(type, fn, opts);
      };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?transport=replay');
    const preview = previewOf(page);
    await cover(page).scrollIntoViewIfNeeded();
    for (let i = 0; i < 3; i++) {
      await cover(page).hover();
      await expect(preview).toHaveAttribute('data-state', 'open');
      await page.mouse.move(5, 5);
      await expect(preview).toHaveCount(0);
    }
    const counts = await page.evaluate(
      () =>
        (
          window as unknown as {
            scrollListeners: { add: number; remove: number };
          }
        ).scrollListeners,
    );
    expect(counts.add).toBeGreaterThanOrEqual(3);
    expect(counts.remove).toBe(counts.add);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the preview appears and disappears with no closing state', async ({
    page,
  }) => {
    await page.goto('/?transport=replay');
    const preview = page.getByTestId(`${KAMUI}:preview`);
    await page.evaluate(() => {
      const states: string[] = [];
      (window as unknown as { states: string[] }).states = states;
      new MutationObserver(() => {
        const el = document.querySelector('[data-testid$=":preview"]');
        if (el) states.push(el.getAttribute('data-state') ?? '');
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    });
    await page
      .getByTestId(NEW_EPISODES)
      .getByTestId(KAMUI)
      .locator('[data-cover]')
      .hover();
    await expect(preview).toHaveAttribute('data-state', 'open');
    await page.mouse.move(5, 5);
    await expect(preview).toHaveCount(0);
    const states = await page.evaluate(
      () => (window as unknown as { states: string[] }).states,
    );
    expect(states).toContain('open');
    expect(states).not.toContain('closing');
  });

  test('a scroll removes the preview immediately', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?transport=replay');
    const preview = page.locator('[data-testid$=":preview"]');
    await page.getByTestId(NEW_EPISODES).locator('[data-cover]').nth(3).hover();
    await expect(preview).toHaveAttribute('data-state', 'open');
    await page.mouse.wheel(0, 150);
    await expect(preview).toHaveCount(0);
  });
});

test('keyboard focus opens the preview and Escape closes it', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  const cover = page.getByTestId(NEW_EPISODES).locator('[data-cover]').first();
  await cover.focus();
  const preview = page.locator('[data-testid$=":preview"]');
  await expect(preview).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
});

test.describe('touch', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test('shows no hover preview', async ({ page }) => {
    await page.goto('/?transport=replay');
    expect(
      await page.evaluate(
        () => matchMedia('(hover: none), (pointer: coarse)').matches,
      ),
    ).toBe(true);
    const cover = page
      .getByTestId(NEW_EPISODES)
      .locator('[data-cover]')
      .first();
    await cover.scrollIntoViewIfNeeded();
    await cover.focus();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid$=":preview"]')).toHaveCount(0);
  });
});

test.describe('shell', () => {
  test('desktop shows the header nav and no tab bar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?transport=replay');
    await expect(page.getByTestId('header')).toBeVisible();
    await expect(page.getByTestId('nav:home')).toBeVisible();
    await expect(page.getByTestId('nav:home')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('tab-bar')).toBeHidden();
    await expect(page.getByTestId('footer')).toBeVisible();
  });

  for (const width of [390, 768]) {
    test(`${width}px shows the tab bar and hides the header nav`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/?transport=replay');
      await expect(page.getByTestId('tab-bar')).toBeVisible();
      await expect(page.getByTestId('tab:home')).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByTestId('nav:home')).toBeHidden();
    });
  }

  test('the header turns solid after scrolling', async ({ page }) => {
    await page.goto('/?transport=replay');
    await expect(page.getByTestId('shelf:airing-this-season')).toBeVisible();
    const header = page.getByTestId('header');
    await expect(header).not.toHaveClass(/af-header--solid/);
    await page.mouse.wheel(0, 400);
    await expect(header).toHaveClass(/af-header--solid/);
  });

  test('the search, notification and account buttons are disabled', async ({
    page,
  }) => {
    await page.goto('/?transport=replay');
    for (const name of ['Tìm kiếm', 'Thông báo', 'Tài khoản']) {
      await expect(page.getByRole('button', { name })).toBeDisabled();
    }
  });
});

test('no width overflows horizontally', async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?transport=replay');
    await expect(page.getByTestId('shelf:airing-this-season')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
  }
});
