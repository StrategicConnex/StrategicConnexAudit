import { test, expect } from "@playwright/test";

// El proxy exige la cookie de disclaimer ANTES de servir /login (commit
// 1269d7b). Sin ella, / redirige a /disclaimer y estos tests de guards
// fallan con la URL equivocada. Se marca la aceptación por cookie igual
// que hace el server action de /disclaimer (src/shared/lib/disclaimer.ts).
test.beforeEach(async ({ page }) => {
  await page.context().addCookies([
    {
      name: "disclaimer_accepted",
      value: "true",
      domain: "localhost",
      path: "/",
    },
  ]);
});

// ─── Authentication Guard ────────────────────────────────────────────────────

test.describe("Authentication Guards", () => {
  // Timeout ampliado: en CI con `.next` frío el redirect del proxy landing en
  // /login puede tardar mientras el dev server compila la página (cold-start
  // verificado 2026-10-19: el goto resuelve networkidle antes de que la
  // navegación del redirect finalice y el default de 5 s quedaba corto).
  test("Dashboard / redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
    await expect(page.locator("h1")).toContainText(/StrategicAudit/i, { timeout: 30000 });
  });

  test("/intelligence redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/intelligence", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
  });

  test("/projects/some-id redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/projects/test-project-123", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
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

  test("has email field", async ({ page }) => {
    const email = page.locator("#login-email");
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute("type", "email");
  });

  test("primary CTA is the magic link button", async ({ page }) => {
    await expect(page.locator('button[type="submit"]').first()).toContainText(/Enviar enlace/i);
  });

  test("does not submit with empty or invalid email", async ({ page }) => {
    const submit = page.locator('button[type="submit"]').first();
    await expect(submit).toBeDisabled();
    // Con '@' pero formato inválido → backend responde 400 → botón deshabilitado.
    // El estado `invalid` NO es local: login/page.tsx solo deshabilita el submit
    // tras el POST a /api/auth/validate-email. Con `.next` frío, Next compila esa
    // ruta en la primera petición y el ciclo entero se pasa de los 5 s por
    // defecto de expect(), así que la aserción fallaba por latencia de compilación
    // y no por comportamiento. 20 s es el margen para el cold-start; no se relaja
    // la aserción, solo el reloj.
    await page.locator("#login-email").fill("malformed@");
    await expect(submit).toBeDisabled({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("password access is collapsed by default and expands on toggle", async ({ page }) => {
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    const toggle = page.getByRole("button", { name: /Acceso con contrase/i });
    await expect(toggle).toBeVisible();
    await toggle.click();
    const password = page.locator('input[type="password"]');
    await expect(password).toBeVisible();
    await expect(password).toHaveAttribute("autocomplete", "current-password");
  });

  test("has support and security footer", async ({ page }) => {
    await expect(page.getByText(/Protegido por Supabase Auth/)).toBeVisible();
    await expect(page.getByText(/Enterprise Grade/)).toBeVisible();
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

  test("GET /api/monitoring responde JSON (401 sin sesión)", async ({ request }) => {
    const res = await request.get("/api/monitoring");
    // La ruta exige sesión: 401 en CI/anónimo, 200 si hubiera cookie de auth.
    expect([200, 401]).toContain(res.status());
    const body = await res.json();
    expect(body).toBeDefined();
  });
});

// ─── Responsive Layout ──────────────────────────────────────────────────────

// Aceptación del disclaimer también para los contexts manuales (viewport
// custom): el gate del proxy opera sobre cualquier request navegable.
async function acceptDisclaimer(ctx: import("@playwright/test").BrowserContext) {
  await ctx.addCookies([
    { name: "disclaimer_accepted", value: "true", domain: "localhost", path: "/" },
  ]);
}

test.describe("Responsive Layout", () => {
  test("mobile 375x812 no horizontal scroll", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await acceptDisclaimer(ctx);
    const page = await ctx.newPage();
    await page.goto("/login", { waitUntil: "networkidle" });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const vw = await page.evaluate(() => window.innerWidth);
    expect(sw).toBeLessThanOrEqual(vw + 2);
    await ctx.close();
  });

  test("tablet 768x1024 heading visible", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    await acceptDisclaimer(ctx);
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
