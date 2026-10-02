import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/* ═══════════════════════════════════════════════════════════════════════════
   Visual Regression Tests — SCAUDIT Design System v2
   
   Captures screenshots of key UI components and compares them against stored
   baselines to catch unintended visual regressions from CSS/color changes.
   
   🔓 Login page: publicly accessible — runs without auth.
   🔒 ScoreGauge + AttackSurfaceGraph + IntelligenceTab SVGs:
       require auth — skip gracefully if TEST_AUTH_EMAIL / TEST_AUTH_PASSWORD
       are not set in .env.local. Uses Supabase REST API password grant.
   
   First run (create baselines):
     npx playwright test e2e/visual-regression.spec.ts --update-snapshots
   
   Update baselines after intentional design changes:
     npx playwright test e2e/visual-regression.spec.ts --update-snapshots
   
   With auth (for gated components):
     TEST_AUTH_EMAIL=user@example.com TEST_AUTH_PASSWORD=xxx npx playwright test
   ═══════════════════════════════════════════════════════════════════════════ */

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

/* ─── Auth helper (Supabase password grant via REST API) ──────────────────────
   The login page only offers Magic Link. For programmatic auth during tests we
   use the Supabase REST API password grant directly, then embed the session
   cookie so that subsequent page navigations are authenticated.
   
   This function runs per test inside beforeEach for all auth-gated tests,
   followed by test.skip() cuando faltan credenciales (Playwright no admite
   fixtures `page`/`context` en beforeAll: se crean por test).
   ─────────────────────────────────────────────────────────────────────────── */

async function tryAuthenticate(page: Page): Promise<boolean> {
  const email = process.env.TEST_AUTH_EMAIL;
  const password = process.env.TEST_AUTH_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!email || !password || !supabaseUrl || !supabaseKey) {
    console.warn(
      "[SKIP] TEST_AUTH_EMAIL / TEST_AUTH_PASSWORD / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o alias ANON) not set"
    );
    return false;
  }

  try {
    // Exchange credentials for a Supabase session via REST API password grant
    const authUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;
    const authRes = await page.request.post(authUrl, {
      headers: {
        apikey: supabaseKey,
        "Content-Type": "application/json",
      },
      data: { email, password },
    });

    if (!authRes.ok()) {
      console.warn(`[WARN] Supabase auth failed: ${authRes.status()}`);
      return false;
    }

    const { access_token, refresh_token, expires_in } = await authRes.json();

    // Set Supabase auth cookies on the browser context so subsequent requests
    // include the session (matches Supabase SSR cookie names used by middleware)
    const expiresAt = Math.floor(Date.now() / 1000) + expires_in;
    await page.context().addCookies([
      {
        name: "sb-access-token",
        value: access_token,
        domain: new URL(BASE_URL).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
        expires: expiresAt,
      },
      {
        name: "sb-refresh-token",
        value: refresh_token,
        domain: new URL(BASE_URL).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
        expires: expiresAt,
      },
    ]);

    return true;
  } catch (err) {
    console.warn(`[WARN] Auth attempt failed: ${err}`);
    return false;
  }
}

/* ─── Skip helper for auth-gated describe blocks ───────────────────────────
   Used with test.describe() + test.skip() at the block level so that no page
   navigation happens inside skipped blocks (avoids wasted time/bandwidth).
   ─────────────────────────────────────────────────────────────────────────── */

function skipUnlessAuthed(authed: boolean): void {
  test.skip(
    !authed,
    "Requires TEST_AUTH_EMAIL / TEST_AUTH_PASSWORD + NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o alias ANON) in .env"
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Login Page — Visual Regression (public, no auth needed)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Visual Regression: Login Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(600); // entrance animation
  });

  test("full login page renders with correct design system", async ({ page }) => {
    await expect(page).toHaveScreenshot("login-full-page.png", {
      fullPage: true,
      // El fondo NeuralNetworkBackground (canvas 2D de baja opacidad) anima
      // con requestAnimationFrame, que `animations: "disabled"` no detiene:
      // se enmascara y se tolera el ruido residual (~1.3 k px de ~1.28 M = 0.1 %).
      maxDiffPixels: 3000,
      animations: "disabled",
      mask: [page.locator("canvas")],
      timeout: 15_000,
    });
  });

  test("glass-card authentication panel renders correctly", async ({ page }) => {
    const card = page.locator('[class*="glass-card"]').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveScreenshot("login-glass-card.png", {
      animations: "disabled",
    });
  });

  test("AiCoreVisual logo renders without errors", async ({ page }) => {
    // AiCoreVisual renderiza `next/image` (`/logo_reina.png`), no WebGL: se
    // valida que la imagen cargue (sin errores de red/decode). El único canvas
    // de la página es el fondo NeuralNetworkBackground, que sí anima por rAF.
    const logo = page.locator('img[src*="logo_reina"]').first();
    await expect(logo).toBeVisible({ timeout: 5000 });

    const img = await logo.evaluate((el: HTMLImageElement) => ({
      complete: el.complete,
      width: el.naturalWidth,
      height: el.naturalHeight,
    }));

    expect(img.complete).toBe(true);
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
  });

  test("email input has correct DS border and focus ring", async ({ page }) => {
    const input = page.locator('input[type="email"]');
    await expect(input).toBeVisible();

    // Idle state
    await expect(input).toHaveScreenshot("login-input-idle.png", {
      animations: "disabled",
    });

    // Focus state
    await input.focus();
    await page.waitForTimeout(200);
    await expect(input).toHaveScreenshot("login-input-focused.png", {
      animations: "disabled",
    });

    // Valid state after filling email: la validación es asíncrona
    // (debounce 400 ms + /api/auth/validate-email), así que se espera al
    // estado `valid` (clase del borde) y a que asienten transición y check.
    await input.fill("test@gmail.com");
    await expect(input).toHaveClass(/border-chartreuse\/50/, { timeout: 20_000 });
    await page.waitForTimeout(600);
    await expect(input).toHaveScreenshot("login-input-valid.png", {
      animations: "disabled",
      timeout: 10_000,
    });
  });

  test("submit button states: disabled vs enabled", async ({ page }) => {
    const button = page.locator('button[type="submit"]');

    // Initially disabled (no email)
    await expect(button).toHaveScreenshot("login-button-disabled.png", {
      animations: "disabled",
    });

    // Enable by filling valid email
    await page.locator('input[type="email"]').fill("test@gmail.com");
    await page.waitForTimeout(800);
    await expect(button).toBeEnabled({ timeout: 5000 });
    await expect(button).toHaveScreenshot("login-button-enabled.png", {
      animations: "disabled",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ScoreGauge — Visual Regression (requires auth)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Visual Regression: ScoreGauge", () => {
  let authed = false;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    authed = await tryAuthenticate(page);
    skipUnlessAuthed(authed);
  });

  test("ScoreGauge renders with DS colors on intelligence page", async ({ page }) => {
    await page.goto("/intelligence", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    await expect(page.locator("svg circle").first()).toBeVisible({ timeout: 10000 });

    const gaugeContainer = page.locator(".flex.flex-col.items-center.gap-3").first();
    await expect(gaugeContainer).toHaveScreenshot("score-gauge-complete.png", {
      animations: "disabled",
    });
  });

  test("ScoreGauge gradient stops are present (SVG linearGradient)", async ({ page }) => {
    await page.goto("/intelligence", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const gaugeSvg = page.locator("svg").first();
    const gradientStops = await gaugeSvg.locator("stop").count();
    expect(gradientStops).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. AttackSurfaceGraph — Visual Regression (requires auth)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Visual Regression: AttackSurfaceGraph", () => {
  let authed = false;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    authed = await tryAuthenticate(page);
    skipUnlessAuthed(authed);
  });

  test("AttackSurfaceGraph SVG renders with DS node colors", async ({ page }) => {
    await page.goto("/intelligence", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const graphSvg = page.locator("svg[viewBox]").first();
    await expect(graphSvg).toBeVisible({ timeout: 10000 });
    await expect(graphSvg).toHaveScreenshot("attack-surface-graph.png", {
      animations: "disabled",
      maxDiffPixels: 300,
    });
  });

  test("AttackSurfaceGraph legend renders with DS tokens", async ({ page }) => {
    await page.goto("/intelligence", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const legend = page.locator(".flex.flex-wrap.gap-2").first();
    await expect(legend).toBeVisible({ timeout: 10000 });
    const legendItems = await legend.locator("> *").count();
    expect(legendItems).toBeGreaterThanOrEqual(1);
  });

  test("AttackSurfaceGraph node groups are interactive (cursor pointer)", async ({ page }) => {
    await page.goto("/intelligence", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const nodes = page.locator("svg [cursor='pointer'], svg g[cursor='pointer']");
    const count = await nodes.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. IntelligenceTab Neural SVGs — Visual Regression (requires auth)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Visual Regression: IntelligenceTab Neural SVGs", () => {
  let authed = false;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    authed = await tryAuthenticate(page);
    skipUnlessAuthed(authed);
  });

  test("neural network animated lines render with DS colors", async ({ page }) => {
    await page.goto("/intelligence", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const lines = page.locator("svg line, svg path");
    const count = await lines.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("intelligence tab layout renders without layout shift", async ({ page }) => {
    await page.goto("/intelligence", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    await expect(page).toHaveScreenshot("intelligence-tab-layout.png", {
      fullPage: true,
      animations: "disabled",
      maxDiffPixels: 500,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Design System Token Verification (no screenshots, computed style checks)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Design System: Token Verification", () => {
  test("CSS custom properties are defined on :root (next-themes data-theme or bare)", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    const properties = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue("--bg").trim(),
        fg: style.getPropertyValue("--fg").trim(),
        primary: style.getPropertyValue("--primary").trim(),
        card: style.getPropertyValue("--card").trim(),
        border: style.getPropertyValue("--border").trim(),
      };
    });

    expect(properties.bg).toBeTruthy();
    expect(properties.fg).toBeTruthy();
    expect(properties.primary).toBeTruthy();
    expect(properties.card).toBeTruthy();
    expect(properties.border).toBeTruthy();
  });

  test("no legacy hex colors remain in rendered elements", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // Scan all rendered elements for color values that might be legacy hex colors
    const hasLegacyColor = await page.evaluate(() => {
      const LEGACY_COLORS = [
        "#06b6d4", "#22d3ee", // legacy cyan
        "#10b981", "#059669", // legacy emerald
        "#ef4444", "#dc2626", // legacy red
        "#f59e0b", "#d97706", // legacy amber
        "#818cf8", "#6366f1", // legacy indigo
        "#8b5cf6", "#7c3aed", // legacy violet
      ];

      const all = Array.from(document.querySelectorAll("*"));
      for (const el of all) {
        const style = getComputedStyle(el);
        for (const prop of ["color", "backgroundColor", "borderColor", "borderTopColor", "borderBottomColor", "borderLeftColor", "borderRightColor", "fill", "stroke"]) {
          const val = style.getPropertyValue(prop).toLowerCase().trim();
          if (LEGACY_COLORS.some((lc) => val.includes(lc))) {
            return { element: el.tagName, class: el.className, property: prop, value: val };
          }
        }
      }
      return null;
    });

    expect(hasLegacyColor).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Dashboard Container — Visual Regression (requires auth)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Visual Regression: Dashboard Container", () => {
  let authed = false;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60_000);
    authed = await tryAuthenticate(page);
    skipUnlessAuthed(authed);
  });

  test("dashboard header renders with correct DS tokens", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const header = page.locator("header").first();
    await expect(header).toBeVisible({ timeout: 10000 });
    await expect(header).toHaveScreenshot("dashboard-header.png", {
      animations: "disabled",
    });
  });

  test("sidebar navigation renders correctly", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const sidebar = page.locator("nav, aside").first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    await expect(sidebar).toHaveScreenshot("dashboard-sidebar.png", {
      animations: "disabled",
    });
  });
});
