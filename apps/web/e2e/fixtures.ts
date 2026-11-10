import { expect, test as base } from '@playwright/test';

interface Options {
  // Console errors matching any of these are ignored. Empty by default: a console error fails the test.
  allowedConsoleErrors: RegExp[];
}

export const test = base.extend<Options & { consoleErrors: string[] }>({
  allowedConsoleErrors: [[], { option: true }],
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

export { expect };
