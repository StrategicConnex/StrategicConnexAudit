import { test, expect } from '@playwright/test';

test('Homepage has correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/StrategicAudit/i);
});
