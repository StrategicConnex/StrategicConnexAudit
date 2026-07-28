import { test, expect } from "@playwright/test";

// ─── Authentication Guard ────────────────────────────────────────────────────

test.describe("Authentication Guards", () => {
  test("Dashboard / redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("h1")).toContainText(/StrategicAudit/i);
  });

  test("/intelligence redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/intelligence", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/projects/some-id redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/projects/test-project-123", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── Login Page ──────────────────────────────────────────────────────────────

test.describe("Login Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
  });

  test("renders with correct title and heading", async ({ page }) => {
    await expect(page).toHaveTitle(/SCAUDIT|StrategicAudit|Enterprise/i);
    await expect(page.locator("h1")).toContainText(/StrategicAudit Pro/i);
  });

  test("has email and password fields", async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator("button[type=submit]")).toContainText(/Entrar/i);
  });

  test("has Magic Link button", async ({ page }) => {
    await expect(page.locator("button", { hasText: /Magic Link/i })).toBeVisible();
  });

  test("does not submit with invalid email", async ({ page }) => {
    await page.locator('input[type="email"]').fill("not-an-email");
    await page.locator('input[type="password"]').fill("short");
    await page.locator("button[type=submit]").click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("has support link", async ({ page }) => {
    await expect(page.locator("button", { hasText: /Contactar Soporte/i })).toBeVisible();
  });

  test("has forgot password link", async ({ page }) => {
    await expect(page.locator("button", { hasText: /Olvidaste/i })).toBeVisible();
  });
});

// ─── API Health ──────────────────────────────────────────────────────────────

test.describe("API Health", () => {
  test("GET /api/intelligence/health returns success", async ({ request }) => {
    const res = await request.get("/api/intelligence/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("success");
  });

  test("GET /api/monitoring returns data", async ({ request }) => {
    const res = await request.get("/api/monitoring");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeDefined();
  });
});

// ─── Responsive Layout ──────────────────────────────────────────────────────

test.describe("Responsive Layout", () => {
  test("mobile 375x812 no horizontal scroll", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.goto("/login", { waitUntil: "networkidle" });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const vw = await page.evaluate(() => window.innerWidth);
    expect(sw).toBeLessThanOrEqual(vw + 2);
    await ctx.close();
  });

  test("tablet 768x1024 heading visible", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const page = await ctx.newPage();
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toContainText(/StrategicAudit Pro/i);
    await ctx.close();
  });
});

// ─── Console Errors ──────────────────────────────────────────────────────────

test.describe("Console Errors", () => {
  test("no critical errors on login page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (err) => errors.push("Page Error: " + err.message));
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.locator("h1").waitFor({ state: "visible", timeout: 5000 });
    const critical = errors.filter(e => !e.includes("Hydration") && !e.includes("DevTools"));
    expect(critical).toEqual([]);
  });
});
