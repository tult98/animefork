import { defineConfig } from '@playwright/test';

const port = 5181;
// A second server built without VITE_API_URL, for the specs that prove the page works with the lookup off.
const noApiPort = 5182;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'artifacts/e2e/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/e2e/report', open: 'never' }],
    ['json', { outputFile: 'artifacts/e2e/results.json' }],
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: `http://localhost:${port}`,
    // Local runs drive the installed Chrome so no browser download is needed; CI sets PW_CHANNEL=chromium.
    channel:
      process.env.PW_CHANNEL === 'chromium'
        ? undefined
        : (process.env.PW_CHANNEL ?? 'chrome'),
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'default', testIgnore: '**/*.no-api.spec.ts' },
    {
      name: 'no-api',
      testMatch: '**/*.no-api.spec.ts',
      use: { baseURL: `http://localhost:${noApiPort}` },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      env: {
        VITE_API_URL: 'https://api.test',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite --port ${noApiPort} --strictPort`,
      url: `http://localhost:${noApiPort}`,
      env: {
        VITE_API_URL: '',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
