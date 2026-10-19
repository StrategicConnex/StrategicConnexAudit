import { test, expect } from '@playwright/test';

// El proxy exige la cookie de disclaimer antes de servir /login; sin ella
// / redirige a /disclaimer y este smoke marcaría el title equivocado.
test.beforeEach(async ({ page }) => {
  await page.context().addCookies([
    { name: 'disclaimer_accepted', value: 'true', domain: 'localhost', path: '/' },
  ]);
});

test('Homepage has correct title', async ({ page }) => {
  await page.goto('/');
  // Tras el disclaimer gate (/ → /login) el title es el de la login page.
  await expect(page).toHaveTitle(/SCAUDIT|Enterprise|StrategicAudit/i);
});
