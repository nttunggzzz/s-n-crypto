import { defineConfig } from '@playwright/test';

/** Run through `npm run e2e` (it builds the app and starts the isolated stack first). */
export default defineConfig({
  testDir: './tests',
  outputDir: '../.e2e/results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: '../.e2e/report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5190',
    // Windows/macOS dev machines: the installed Edge (no download). CI: Playwright's Chromium.
    channel: process.env.CI ? undefined : 'msedge',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: {} },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, grep: /@mobile/ },
  ],
});
