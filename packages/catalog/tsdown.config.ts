import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  hash: false,
  clean: true,
});
