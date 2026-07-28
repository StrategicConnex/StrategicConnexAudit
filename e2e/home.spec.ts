import { test, expect } from '@playwright/test';

test('Homepage has correct title', async ({ page }) => {
  await page.goto('/');
  await // After redirect to /login, title should contain SCAUDIT
  await expect(page).toHaveTitle(/SCAUDIT|Enterprise|StrategicAudit/i);
});
