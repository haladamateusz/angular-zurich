import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts/chat',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  outputDir: 'tmp/chat-browser-results',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4300',
    headless: true,
    ...(process.env['PLAYWRIGHT_CHANNEL'] ? { channel: process.env['PLAYWRIGHT_CHANNEL'] } : {}),
  },
  webServer: process.env['PLAYWRIGHT_BASE_URL']
    ? undefined
    : {
        command: 'npm start -- --port 4300',
        url: 'http://localhost:4300',
        reuseExistingServer: !process.env['CI'],
        timeout: 60000,
      },
});
