import { defineConfig } from '@playwright/test';

const port = 5181;

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
    // Pinned so the browser's own language never decides which copy a test sees.
    locale: 'vi-VN',
    // Local runs drive the installed Chrome so no browser download is needed; CI sets PW_CHANNEL=chromium.
    channel:
      process.env.PW_CHANNEL === 'chromium'
        ? undefined
        : (process.env.PW_CHANNEL ?? 'chrome'),
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
