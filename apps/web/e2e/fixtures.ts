import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test as base, type Page } from '@playwright/test';

const poster = readFileSync(
  resolve(import.meta.dirname, '../public/fixtures/poster.svg'),
);

interface Options {
  // Console errors matching any of these are ignored. Empty by default: a console error fails the test.
  allowedConsoleErrors: RegExp[];
}

export const test = base.extend<
  Options & {
    consoleErrors: string[];
    stubCdnImages: void;
    stubArtApi: void;
  }
>({
  allowedConsoleErrors: [[], { option: true }],
  stubCdnImages: [
    async ({ page }, use) => {
      await page.route('**/cdn.animevietsub.best/**', (route) =>
        route.fulfill({ contentType: 'image/svg+xml', body: poster }),
      );
      await use();
    },
    { auto: true },
  ],
  stubArtApi: [
    async ({ page }, use) => {
      await page.route('**/api.test/**', (route) =>
        route.fulfill({ json: { art: {} } }),
      );
      await use();
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors: string[] = [];
      const record = (text: string) => {
        if (!allowedConsoleErrors.some((re) => re.test(text)))
          errors.push(text);
      };
      page.on('console', (msg) => {
        if (msg.type() === 'error') record(msg.text());
      });
      page.on('pageerror', (err) => record(err.message));
      await use(errors);
      expect(errors, 'console errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});

// The upcoming shelf keeps the fixture's years, so its tests fix the page clock instead of reading the real one.
export const UPCOMING_NOW = new Date('2026-11-11T12:00:00Z');

export { expect };

// Renames the first hero slides of the replayed home page, in order.
export async function renameHeroSlides(page: Page, names: string[]) {
  await page.route('**/fixtures/default/index.html', async (route) => {
    const res = await route.fetch();
    let n = 0;
    const body = (await res.text()).replace(
      /<div class="Title">[^<]*<\/div>/g,
      (match) =>
        n < names.length ? `<div class="Title">${names[n++]}</div>` : match,
    );
    await route.fulfill({ response: res, body });
  });
}
