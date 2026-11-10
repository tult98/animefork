import { expect, test } from './fixtures.ts';

async function openHome(page: import('@playwright/test').Page) {
  await page.clock.install();
  await page.goto('/?transport=replay');
  await expect(page.getByTestId('hero')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1_000));
  // Changing slide restarts the 7 s timer at the paused clock, so the tests count from a known zero.
  await page.getByTestId('hero:next').click();
  await page.getByTestId('hero:prev').click();
  await page.mouse.move(2, 2);
  await expect(page.getByTestId('hero:counter')).toHaveText('1 trên 10');
}

async function visibleSlides(page: import('@playwright/test').Page) {
  return page
    .getByTestId('hero')
    .locator('[data-testid^="hero:slide:"]')
    .evaluateAll(
      (els) =>
        els.filter((el) => getComputedStyle(el).visibility === 'visible')
          .length,
    );
}

test('the hero has 10 slides and exactly one is visible', async ({ page }) => {
  await page.goto('/?transport=replay');
  const hero = page.getByTestId('hero');
  await expect(hero).toBeVisible();
  await expect(hero.locator('[data-testid^="hero:slide:"]')).toHaveCount(10);
  await expect(page.getByTestId('hero:slide:0')).toBeVisible();
  await expect.poll(() => visibleSlides(page)).toBe(1);
  await expect(page.getByTestId('hero:counter')).toHaveText('1 trên 10');
});

test('the hero advances every 7 seconds with a cross-fade', async ({
  page,
}) => {
  await openHome(page);
  const counter = page.getByTestId('hero:counter');
  await page.clock.runFor(6_900);
  await expect(counter).toHaveText('1 trên 10');
  await page.clock.runFor(200);
  await expect(counter).toHaveText('2 trên 10');
  await expect(page.getByTestId('hero:slide:1')).toBeVisible();
  await expect.poll(() => visibleSlides(page)).toBe(1);
});

test('pause stops the advance and play resumes it', async ({ page }) => {
  await openHome(page);
  const counter = page.getByTestId('hero:counter');
  await page.getByTestId('hero:pause').click();
  await page.mouse.move(2, 2);
  await page.getByTestId('shelf:new-episodes').scrollIntoViewIfNeeded();
  await page.clock.runFor(30_000);
  await expect(counter).toHaveText('1 trên 10');

  await page.getByTestId('hero:pause').click();
  await page.mouse.move(2, 2);
  await page.clock.runFor(7_100);
  await expect(counter).toHaveText('2 trên 10');
});

test('previous and next wrap around', async ({ page }) => {
  await page.goto('/?transport=replay');
  const counter = page.getByTestId('hero:counter');
  await expect(counter).toHaveText('1 trên 10');
  await page.getByTestId('hero:prev').click();
  await expect(counter).toHaveText('10 trên 10');
  await page.getByTestId('hero:next').click();
  await expect(counter).toHaveText('1 trên 10');
});

test('hovering the hero pauses the advance', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('hero').hover();
  await page.clock.runFor(30_000);
  await expect(page.getByTestId('hero:counter')).toHaveText('1 trên 10');
});

test('focus inside the hero pauses the advance', async ({ page }) => {
  await openHome(page);
  await page.keyboard.press('Shift');
  await page.getByTestId('hero:next').focus();
  await page.mouse.move(2, 2);
  await page.clock.runFor(30_000);
  await expect(page.getByTestId('hero:counter')).toHaveText('1 trên 10');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('never advances on its own', async ({ page }) => {
    await openHome(page);
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('hero:counter')).toHaveText('1 trên 10');
    await expect(page.getByTestId('hero:pause')).toHaveCount(0);
    await page.getByTestId('hero:next').click();
    await expect(page.getByTestId('hero:counter')).toHaveText('2 trên 10');
  });
});

test('a slide shows the name, the meta line, a clamped description and a Play link', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  const slide = page.getByTestId('hero:slide:0');
  await expect(slide.getByRole('heading')).not.toBeEmpty();
  await expect(slide).toContainText(/TV · .*\/10/);
  await expect(slide).not.toContainText(/\d\d\/(\d\d|\?\?)/);
  await expect(slide.getByRole('link', { name: 'Phát' })).toHaveAttribute(
    'href',
    /^\/phim\//,
  );
  const lines = await slide
    .locator('.af-billboard-text')
    .evaluate((el) => getComputedStyle(el).webkitLineClamp);
  expect(lines).toBe('2');
});

test('the hero controls show a focus ring', async ({ page }) => {
  await page.goto('/?transport=replay');
  await page.getByTestId('hero:next').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const outline = await page
    .getByTestId('hero:next')
    .evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');
});
