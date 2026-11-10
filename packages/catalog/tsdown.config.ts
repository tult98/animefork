import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  hash: false,
  clean: true,
  // .mjs rather than .js: Vite's oxc pass tries to resolve a tsconfig for a linked .js file and trips over the extension's.
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
});
