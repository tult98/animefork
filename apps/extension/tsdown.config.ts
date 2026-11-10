// The only build config in the extension: one IIFE bundle per entry per target, plus the npm client.
import { writeFile } from 'node:fs/promises';

import { defineConfig, type UserConfig } from 'tsdown';

import allowlist from './allowlist.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };
import { manifestFor } from './src/manifest.ts';
import { ENTRIES, targets, type Target } from './src/targets.ts';

/** One config per entry: rolldown refuses multi-entry IIFE builds. */
function extension(target: Target, dev: boolean): UserConfig[] {
  const root = `dist/${target.name}`;
  const shared: UserConfig = {
    platform: 'browser',
    format: 'iife',
    outDir: `${root}/dist`,
    outputOptions: { entryFileNames: '[name].js' },
    hash: false,
    clean: false,
    dts: false,
    sourcemap: dev ? 'inline' : false,
    deps: { alwaysBundle: [/.*/], onlyBundle: false },
    define: { __MV3__: 'true', __DEV__: String(dev) },
  };
  return Object.entries(ENTRIES).map(([out, src], i): UserConfig => ({
    ...shared,
    entry: { [out]: src },
    // The first config of a target owns the target root: clean it, copy icons, write the manifest.
    ...(i === 0 && {
      clean: [root],
      copy: [{ from: 'assets', to: root }],
      onSuccess: () =>
        writeFile(
          `${root}/manifest.json`,
          JSON.stringify(
            manifestFor(target, { ...pkg, hosts: allowlist.hosts }),
            null,
            2,
          ),
        ),
    }),
  }));
}

/** The published npm client. File names stay index.js / index.mjs / index.d.ts like the 1.0.x package. */
const client: UserConfig = {
  entry: { index: 'src/client/index.ts' },
  outDir: 'client/dist',
  format: ['cjs', 'esm'],
  platform: 'neutral',
  target: 'es2015',
  dts: true,
  hash: false,
  define: { __MV3__: 'true' },
  outExtensions: ({ format }) => ({
    js: format === 'cjs' ? '.js' : '.mjs',
    dts: '.d.ts',
  }),
};

export default defineConfig((cli) => [
  ...targets.flatMap((t) => extension(t, Boolean(cli.watch))),
  client,
]);
