import { defineConfig } from 'tsdown';

/** The published npm client. File names stay index.js / index.mjs / index.d.ts like the 1.0.x package. */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  platform: 'neutral',
  tsconfig: 'tsconfig.build.json',
  target: 'es2015',
  dts: true,
  hash: false,
  outExtensions: ({ format }) => ({
    js: format === 'cjs' ? '.js' : '.mjs',
    dts: '.d.ts',
  }),
});
