import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke tests (e2e/). Run against any environment:
//   E2E_BASE_URL=https://persons-staff-app-staging-….run.app npm run e2e
// Signed-in flows need E2E_PHONE / E2E_PASSWORD of a TEST account (staging),
// never a real person's credentials. First run: `npx playwright install chromium`.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
