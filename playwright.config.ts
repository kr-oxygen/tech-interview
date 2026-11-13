import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @ti/api build && cd apps/api && node dist/main.js',
      // 401 counts as "up" for Playwright.
      url: 'http://localhost:3001/api/auth/me',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    { command: 'pnpm --filter @ti/web dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
});
