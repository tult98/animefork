// Compares the manifest WXT generated (`nx build`, which `nx test` depends on) with the
// reviewed fixtures. A manifest change shows up as a fixture diff in the PR.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import allowlist from '../config/allowlist.json' with { type: 'json' };
import chromeFixture from '../fixtures/manifest.chrome-mv3.json' with { type: 'json' };
import firefoxFixture from '../fixtures/manifest.firefox-mv3.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };

const built = (target: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../dist/${target}/manifest.json`, import.meta.url),
      'utf8',
    ),
  );

describe('manifest', () => {
  test.each([
    ['chrome-mv3', chromeFixture],
    ['firefox-mv3', firefoxFixture],
  ])('%s build equals its fixture', (target, fixture) => {
    expect(built(target)).toEqual(fixture);
  });

  test('chrome and firefox differ only in background and gecko keys', () => {
    const omit = (manifest: object, keys: string[]) =>
      Object.fromEntries(
        Object.entries(manifest).filter(([key]) => !keys.includes(key)),
      );
    expect(
      omit(firefoxFixture, ['background', 'browser_specific_settings']),
    ).toEqual(omit(chromeFixture, ['background']));
    expect(chromeFixture.background).toEqual({
      service_worker: 'background.js',
    });
    expect(firefoxFixture.background).toEqual({ scripts: ['background.js'] });
    expect(firefoxFixture.browser_specific_settings.gecko).toEqual({
      id: '{26005fb7-3d84-4144-a688-a058944123b3}',
      strict_min_version: '128.0',
    });
  });

  test('version comes from package.json and relay matches the allowlist', () => {
    expect(chromeFixture.version).toBe(pkg.version);
    const relay = chromeFixture.content_scripts.find((script) =>
      script.js.includes('content-scripts/relay.js'),
    );
    expect(relay?.matches).toHaveLength(allowlist.hosts.length * 2);
  });
});
