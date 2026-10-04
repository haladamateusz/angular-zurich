import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts/submissions',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  outputDir: 'tmp/submission-browser-results',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4301',
    headless: true,
    reducedMotion: 'reduce',
    ...(process.env['PLAYWRIGHT_CHANNEL'] ? { channel: process.env['PLAYWRIGHT_CHANNEL'] } : {}),
  },
  webServer: process.env['PLAYWRIGHT_BASE_URL']
    ? undefined
    : {
        command: 'npm start -- --port 4301',
        url: 'http://localhost:4301',
        reuseExistingServer: !process.env['CI'],
        timeout: 60000,
      },
});
