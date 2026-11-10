import { expect, test } from './fixtures.ts';

const SECTIONS = ['buttons', 'inputs', 'header', 'paper'] as const;

test.beforeEach(async ({ page }) => {
  await page.goto('/design?transport=replay');
  await expect(page.getByTestId('design:buttons')).toBeVisible();
});

test('renders every gallery section', async ({ page }) => {
  for (const id of SECTIONS) {
    await expect(page.getByTestId(`design:${id}`)).toBeVisible();
  }
});

test('pill tones paint from the stage tokens', async ({ page }) => {
  const buttons = page.getByTestId('design:buttons');
  await expect(buttons.locator('.af-pill--play').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(buttons.locator('.af-pill--play').first()).toHaveCSS(
    'color',
    'rgb(20, 20, 20)',
  );
  await expect(buttons.locator('.af-pill--brand').first()).toHaveCSS(
    'background-color',
    'rgb(217, 56, 26)',
  );
});

test('outline icons keep their stroke and the play glyph is solid', async ({
  page,
}) => {
  const buttons = page.getByTestId('design:buttons');
  await expect(buttons.locator('.af-pill--quiet svg').first()).toHaveCSS(
    'fill',
    'none',
  );
  await expect(buttons.locator('.af-pill--play svg').first()).toHaveCSS(
    'fill',
    'rgb(20, 20, 20)',
  );
});

test('the paper section re-maps the tokens', async ({ page }) => {
  const paper = page.getByTestId('design:paper');
  const wrapper = paper.locator('[data-theme="paper"]');
  const token = (name: string, el = wrapper) =>
    el.evaluate(
      (node, n) => getComputedStyle(node).getPropertyValue(n).trim(),
      name,
    );

  expect(await token('--canvas')).toBe('#FFFFFF');
  const stageInk = await token('--ink', page.locator('html'));
  const paperInk = await token('--ink');
  expect(stageInk).not.toBe(paperInk);

  await expect(paper.locator('.af-btn--utility-outline').first()).toHaveCSS(
    'border-top-color',
    'rgb(118, 118, 118)',
  );
});

test('the label floats once the field has a value', async ({ page }) => {
  const field = page.getByTestId('design:inputs').locator('.af-field').first();
  const label = field.locator('label');
  await expect(label).toHaveCSS('top', '18px');
  await field.locator('input').fill('mika@example.com');
  await expect(label).toHaveCSS('top', '8px');
});

test('the error field is invalid and described by its message', async ({
  page,
}) => {
  const input = page
    .getByTestId('design:inputs')
    .locator('.af-field--error input');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await input.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
    'Error: enter a full email address.',
  );
});

test('the header marks one current page and names its icon buttons', async ({
  page,
}) => {
  const header = page.getByTestId('design:header');
  await expect(header.locator('[aria-current="page"]')).toHaveCount(2);
  await expect(
    header.getByRole('button', { name: 'Search' }).first(),
  ).toBeVisible();
  await expect(
    header.getByRole('button', { name: 'Notifications' }).first(),
  ).toBeVisible();
  await expect(
    header.getByRole('img', { name: 'Profile' }).first(),
  ).toBeVisible();
});

test('keyboard focus draws a 2px outline', async ({ page }) => {
  const play = page.locator('.af-pill--play').first();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    if (await play.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(play).toBeFocused();
  await expect(play).toHaveCSS('outline-width', '2px');
  await expect(play).toHaveCSS('outline-style', 'solid');
});
