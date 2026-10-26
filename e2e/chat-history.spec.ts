import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/* ═══════════════════════════════════════════════════════════════════════════
   E2E — Historial del copilot en localStorage (Sprint 1, semana 2)

   El copilot vive tras el login (el dashboard redirige a /login sin sesión),
   así que el spec autentica con el mismo contrato que
   e2e/realtime-overview.spec.ts (password grant + cookie sb-<ref>-auth-token).

   NO llama a la IA: siembra el historial directamente en localStorage y
   comprueba que el diálogo lo restaura al abrirse (y que un historial vencido
   cae al saludo). Determinista y sin coste de tokens.

   Se OMITE sin TEST_AUTH_EMAIL / TEST_AUTH_PASSWORD (convención de
   e2e/a11y.spec.ts): el skip es de Playwright, no un comentario.
   ═══════════════════════════════════════════════════════════════════════════ */

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.TEST_AUTH_EMAIL;
const TEST_PASSWORD = process.env.TEST_AUTH_PASSWORD;

interface SupabaseAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  user: unknown;
}

/** Password grant + cookie real de @supabase/ssr (mismo contrato que realtime-overview). */
async function tryAuthenticate(page: Page): Promise<boolean> {
  if (!TEST_EMAIL || !TEST_PASSWORD || !SUPABASE_URL || !ANON_KEY) return false;
  try {
    const authRes = await page.request.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
      },
    );
    if (!authRes.ok()) {
      console.warn(`[WARN] Supabase auth falló: HTTP ${authRes.status()}`);
      return false;
    }

    const session = (await authRes.json()) as SupabaseAuthResponse;
    const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
    if (!ref) return false;

    const expiresAt = Math.floor(Date.now() / 1000) + session.expires_in;
    const cookieValue =
      "base64-" +
      Buffer.from(
        JSON.stringify({
          access_token: session.access_token,
          token_type: session.token_type ?? "bearer",
          expires_in: session.expires_in,
          expires_at: expiresAt,
          refresh_token: session.refresh_token,
          user: session.user,
        }),
      ).toString("base64url");

    await page.context().addCookies([
      {
        name: `sb-${ref}-auth-token`,
        value: cookieValue,
        domain: new URL(BASE_URL).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
        expires: expiresAt,
      },
    ]);
    return true;
  } catch (err) {
    console.warn(`[WARN] No se pudo autenticar: ${err}`);
    return false;
  }
}

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([
    { name: "disclaimer_accepted", value: "true", domain: "localhost", path: "/" },
  ]);
});

test.describe("Historial del copilot (localStorage)", () => {
  test("la conversación sembrada se restaura al abrir el copilot", async ({ page }) => {
    const authed = await tryAuthenticate(page);
    test.skip(!authed, "Faltan TEST_AUTH_EMAIL/TEST_AUTH_PASSWORD para rutas autenticadas");

    // addInitScript siembra ANTES de que cualquier script de la página corra:
    // el historial ya está en localStorage cuando React hidrata. Con
    // `networkidle` el test colgaba (el dashboard hace polling + consultas
    // lentas a la BD: nunca hay 500 ms de red silenciosa y el reloj del test
    // se agota aunque el estado final sea correcto).
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "scaudit:chat:copilot",
        JSON.stringify({
          v: 1,
          savedAt: Date.now(),
          messages: [
            { role: "user", content: "Pregunta archivada e2e" },
            { role: "assistant", content: "Respuesta archivada e2e" },
          ],
        }),
      );
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // El click auto-espera a que el trigger exista (hidratación + datos).
    await page.getByRole("button", { name: /Abrir Strategic Copilot/i }).click();

    await expect(page.getByText("Respuesta archivada e2e")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Pregunta archivada e2e")).toBeVisible();
  });

  test("un historial vencido (TTL 7 días) cae al saludo, no resucita", async ({ page }) => {
    const authed = await tryAuthenticate(page);
    test.skip(!authed, "Faltan TEST_AUTH_EMAIL/TEST_AUTH_PASSWORD para rutas autenticadas");

    await page.addInitScript(() => {
      window.localStorage.setItem(
        "scaudit:chat:copilot",
        JSON.stringify({
          v: 1,
          savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 días atrás
          messages: [{ role: "user", content: "Mensaje vencido e2e" }],
        }),
      );
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: /Abrir Strategic Copilot/i }).click();

    await expect(page.getByText(/Soy Strategic Copilot/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Mensaje vencido e2e")).toHaveCount(0);
  });
});
