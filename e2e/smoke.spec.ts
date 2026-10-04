import { expect, test, type Page } from '@playwright/test';

const PHONE = process.env.E2E_PHONE;
const PASSWORD = process.env.E2E_PASSWORD;

async function signIn(page: Page) {
  await page.goto('/staff/uz/login');
  await page.locator('input[type="tel"], input[name="phone"]').first().fill(PHONE!);
  await page.locator('input[type="password"]').first().fill(PASSWORD!);
  await page.getByRole('button', { name: /kirish/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test('login page renders', async ({ page }) => {
  await page.goto('/staff/uz/login');
  await expect(page.getByRole('button', { name: /kirish/i })).toBeVisible();
});

test('signed-out visitor is sent to login', async ({ page }) => {
  await page.goto('/staff/uz/tasks');
  await expect(page).toHaveURL(/\/login/);
});

test('health endpoint answers', async ({ request }) => {
  const res = await request.get('/staff/api/health');
  expect(res.status()).toBeLessThan(500);
});

test.describe('signed in', () => {
  test.skip(!PHONE || !PASSWORD, 'set E2E_PHONE / E2E_PASSWORD (test account)');

  for (const path of ['dashboard', 'tasks', 'issues', 'finance', 'settings', 'market', 'chat']) {
    test(`${path} loads without an error card or horizontal scroll`, async ({ page }) => {
      await signIn(page);
      await page.goto(`/staff/uz/${path}`);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByText(/something went wrong|xatolik yuz berdi/i)).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('theme picker switches and persists', async ({ page }) => {
    await signIn(page);
    await page.goto('/staff/uz/settings');
    await page.getByRole('button', { name: /shimol/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'shimol');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'shimol');
    await page.getByRole('button', { name: /aurora/i }).click();
  });
});
