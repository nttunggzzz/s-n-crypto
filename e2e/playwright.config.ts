import { defineConfig } from '@playwright/test';

/** Tests that need the host-mode stack (:5191 — invite-only sign-up, no email verification). */
const HOST_MODE = /[\\/]host-mode[\\/]/;

/** Run through `npm run e2e` (it builds the app and starts the two isolated stacks first). */
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
    // the default stack (:5190): open sign-up, email verification required (development defaults)
    { name: 'desktop', use: {}, testIgnore: HOST_MODE },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, grep: /@mobile/, testIgnore: HOST_MODE },
    // the stack configured like the owner's live server (`npm run host`): what real users get
    { name: 'host-mode', testDir: './tests/host-mode', use: { baseURL: 'http://localhost:5191' } },
  ],
});
