import { expect, test } from './fixtures.ts';

test('home renders on the stage theme with Archivo loaded', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  await expect(page.getByTestId('shelf:new-episodes')).toBeVisible();

  const theme = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].filter(
      (f) => f.family.replace(/["']/g, '') === 'Archivo',
    );
    return {
      dataTheme: document.documentElement.dataset.theme,
      background: getComputedStyle(document.body).backgroundColor,
      check500: document.fonts.check('500 16px Archivo'),
      weights: [...new Set(faces.map((f) => f.weight))].sort(),
      loaded500: faces.some((f) => f.weight === '500' && f.status === 'loaded'),
      vietnameseRanges: faces
        .filter((f) => /1EA0/i.test(f.unicodeRange))
        .map((f) => f.weight)
        .sort(),
    };
  });

  expect(theme.dataTheme).toBe('stage');
  expect(theme.background).toBe('rgb(20, 20, 20)');
  expect(theme.check500).toBe(true);
  expect(theme.weights).toEqual(['400', '500', '600', '700', '800', '900']);
  // Faces load lazily per unicode-range, so the Vietnamese subset is asserted as registered, not loaded.
  expect(theme.vietnameseRanges).toEqual(theme.weights);
  expect(theme.loaded500, 'the 500 latin face was used by the home page').toBe(
    true,
  );
});

test('the tab icon is the app icon, which has its own background', async ({
  page,
}) => {
  await page.goto('/?transport=replay');
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBe('/brand/animefork-app-icon.svg');

  const res = await page.request.get(href ?? '');
  expect(res.ok()).toBe(true);
  expect(
    await res.text(),
    'a filled rect keeps the icon visible on a light tab',
  ).toContain('<rect');
});
