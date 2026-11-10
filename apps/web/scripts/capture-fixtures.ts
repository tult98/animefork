// Captures fixtures from the live upstream site through a real browser with the AnimeVsub Helper
// extension. It cannot run headless in CI: the upstream sits behind Cloudflare, which answers curl
// and plain scripts with 403. This script does not try to get around that. It only reads pages the
// extension can already fetch for a human-operated browser, and it stops if one answers anything but 200.
//
// Prerequisites
//   1. pnpm nx build extension-animevsub-helper     (produces apps/extension/dist/chrome-mv3)
//   2. pnpm nx dev web                              (the app must serve on --app, default :5180)
//   3. pnpm --filter web exec playwright install chromium
//      Branded Chrome ignores --load-extension, so this needs Chrome for Testing.
//
// Usage
//   node scripts/capture-fixtures.ts [--set captured] [--app http://localhost:5180]
//                                    [--extension <dir>] [--dry-run]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fixtureFileFor } from '../src/lib/transport/fixture-path.ts';

// Add a route here when a parser needs a new fixture.
const TARGETS = ['/'];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    set: { type: 'string', default: 'captured' },
    app: { type: 'string', default: 'http://localhost:5180' },
    extension: {
      type: 'string',
      default: resolve(root, '../extension/dist/chrome-mv3'),
    },
    'dry-run': { type: 'boolean', default: false },
  },
});

if (values.set === 'default') {
  throw new Error(
    'Refusing to overwrite the excerpt "default" fixture set. Pick another --set.',
  );
}

const outDir = join(root, 'public', 'fixtures', values.set);
const plan = TARGETS.map((url) => ({
  url,
  file: join(outDir, fixtureFileFor(url)),
}));

console.log(`fixture set: ${values.set}`);
for (const { url, file } of plan)
  console.log(`  ${url} -> ${relative(root, file)}`);
if (values['dry-run']) process.exit(0);

// Playwright is only needed for a real capture, so the dry run works without a browser.
const { chromium } = await import('@playwright/test');
const profile = join(root, 'artifacts', 'capture-profile');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: false,
  args: [
    `--disable-extensions-except=${values.extension}`,
    `--load-extension=${values.extension}`,
  ],
});

try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${values.app}/?transport=extension`);
  // The extension tags <html> with data-http-version once its content script is injected.
  await page
    .waitForFunction(
      () => document.documentElement.dataset.httpVersion,
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {
      throw new Error(
        'The extension did not inject. Check --extension points at a built chrome-mv3 directory.',
      );
    });
  await page.waitForFunction(() => window.__app !== undefined, undefined, {
    timeout: 15_000,
  });

  for (const { url, file } of plan) {
    const res = await page.evaluate(
      (target) => window.__app!.transport.get({ url: target }),
      url,
    );
    if (res.status !== 200) {
      throw new Error(
        `${url} answered ${res.status}. If this is a Cloudflare challenge, open the site in this window, pass it by hand, then re-run.`,
      );
    }
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, res.data);
    console.log(`captured ${url} (${res.data.length} bytes)`);
  }
} finally {
  await context.close();
}
