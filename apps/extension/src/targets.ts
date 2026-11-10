/**
 * The build matrix, as data. One row per shipped browser package. Every target is MV3:
 * adding a browser means adding a row here, and nothing else in the repo names a flavor.
 * `gecko` marks the targets that need Firefox-only manifest keys.
 */
export const TARGETS = {
  'chrome-mv3': { gecko: false },
  'firefox-mv3': { gecko: true },
} as const satisfies Record<string, { gecko: boolean }>;

export type TargetName = keyof typeof TARGETS;
export interface Target {
  name: TargetName;
  gecko: boolean;
}

export const targets: readonly Target[] = Object.entries(TARGETS).map(
  ([name, t]) => ({ name: name as TargetName, gecko: t.gecko }),
);

/**
 * Every bundle the extension ships, keyed by its output path under `<target>/dist/`.
 * Output paths are frozen: inject.ts loads `dist/contentScripts/<name>.global.js` through
 * runtime.getURL, and the manifest lists them. All bundles are classic IIFE scripts, so the
 * Chrome service worker and the Firefox event page are the same file.
 */
export const ENTRIES = {
  'background/index': 'src/background/index.ts',
  'contentScripts/index.global': 'src/contentScripts/index.ts',
  'contentScripts/inject.global': 'src/contentScripts/inject.ts',
  'contentScripts/inject2.global': 'src/contentScripts/inject2.ts',
  'contentScripts/embed.global': 'src/contentScripts/embed.ts',
} as const;

export type BundlePath = `dist/${keyof typeof ENTRIES}.js`;
