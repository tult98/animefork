import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Auth tests run scrypt at 2^17 and several files run in parallel, so a 2-core CI runner passes 5 s.
    testTimeout: 30_000,
    setupFiles: ['test/setup.ts'],
  },
});
