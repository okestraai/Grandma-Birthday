import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests in a real browser against the running stack with demo data.
 *   npm run infra:up && npm run db:migrate && npm run db:seed
 *   npm run test:e2e        (starts the API and web dev server if they are not running)
 * Set PW_CHANNEL=chrome to use an installed Google Chrome instead of Playwright's Chromium.
 */
const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB,
    channel: process.env.PW_CHANNEL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        { command: 'npm run start -w apps/api', url: 'http://localhost:4100/api/health', reuseExistingServer: true, timeout: 60_000 },
        { command: 'npm run dev -w apps/web', url: WEB, reuseExistingServer: true, timeout: 60_000 },
      ],
});
