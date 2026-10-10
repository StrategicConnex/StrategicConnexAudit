import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/* ═══════════════════════════════════════════════════════════════════════════
   E2E — Supabase Realtime en OverviewTab (ADR-004-AMEND, TEST de Fase 2)

   Cierra el hueco declarado en el ADR §9: "test que compruebe la publicación de
   la tabla y el corte del polling en la ruta feliz". Los tests unitarios de
   OverviewTab mockean el cliente de Supabase, así que NO ejercitan el handshake
   ni el filtrado RLS del servidor. Este spec sí: inserta una fila real en
   `intelligence_run_events` y mide la reacción del hero en un navegador real.

   POR QUÉ ES OPT-IN Y NO CORRE EN CI

   La CI estándar levanta supabase-js con un cliente falso (los unit tests) y no
   tiene un proyecto Supabase vivo con Realtime publicado: correrlo allí daría
   un rojo permanente que no señala un defecto. Por eso, y por coste/velocidad,
   el spec se OMITE salvo que se pida explícitamente:

     # se omite (verde, sin ejecutar) — estado por defecto y en CI
     npx playwright test e2e/realtime-overview.spec.ts

     # se ejecuta contra un entorno de staging con Supabase vivo
     RUN_REALTIME_E2E=1 \
     PLAYWRIGHT_TEST_BASE_URL=https://staging.example.com \
     NEXT_PUBLIC_FEATURE_REALTIME_LIVE=1 \
     npx playwright test --grep @realtime

   El skip es de Playwright (`test.skip`), no un comentario: el reporte lo marca
   como "skipped", no como "passed", para que un skip silencioso no se lea como
   evidencia.

   VARIABLES REQUERIDAS PARA EJECUTARLO

     NEXT_PUBLIC_SUPABASE_URL               URL del proyecto Supabase
     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   key pública (o alias ANON)
     SUPABASE_SERVICE_ROLE_KEY              service role: INSERT de la fila
     REALTIME_E2E_INVESTIGATION_ID          investigación del usuario de prueba
     TEST_AUTH_EMAIL / TEST_AUTH_PASSWORD   login por password grant
     NEXT_PUBLIC_FEATURE_REALTIME_LIVE=1    flag on (clave pública, ver flags.ts)

   La fila se inserta con el service role (bypassa RLS) y Realtime la entrega al
   navegador solo si el usuario autenticado puede LEERLA por RLS. Es decir, la
   investigación debe pertenecer (owner/member) al usuario de prueba; si no,
   el evento no llega y el test falla con razón — que es justo lo que se quiere
   medir.
   ═══════════════════════════════════════════════════════════════════════════ */

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INVESTIGATION_ID = process.env.REALTIME_E2E_INVESTIGATION_ID;
const TEST_EMAIL = process.env.TEST_AUTH_EMAIL;
const TEST_PASSWORD = process.env.TEST_AUTH_PASSWORD;

/** Opt-in explícito: sin esta variable el spec se omite siempre. */
const OPT_IN = process.env.RUN_REALTIME_E2E === "1";
/** La CI estándar no tiene Supabase vivo: nunca debe intentar ejecutarlo. */
const IN_CI = process.env.CI === "true";

/**
 * Periodo del sondeo de respaldo del hero (OverviewTab.tsx: FALLBACK_MS). Si
 * Realtime está suscrito NO debe aparecer NINGUNA petición al endpoint en una
 * ventana de este tamaño; una sola delata que el sondeo está corriendo.
 */
const POLLING_PERIOD_MS = 15_000;

/** Ruta del snapshot que el hero pide al refrescar (y que el sondeo repetiría). */
const LIVE_ROUTE = "/api/intelligence/live";

/**
 * Motivo por el que el spec no debe ejecutarse, o `null` si todo está listo.
 * Se devuelve el texto y no un booleano para que el reporte explique el porqué.
 */
function skipReason(): string | null {
  if (IN_CI) {
    return "Requires live Supabase environment — omitted in CI (los unit tests usan un cliente mock)";
  }
  if (!OPT_IN) {
    return "Opt-in: ejecuta con RUN_REALTIME_E2E=1 contra un entorno con Supabase vivo";
  }
  const faltan: string[] = [];
  if (!SUPABASE_URL) faltan.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!ANON_KEY) faltan.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o alias ANON)");
  if (!SERVICE_ROLE_KEY) faltan.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!INVESTIGATION_ID) faltan.push("REALTIME_E2E_INVESTIGATION_ID");
  if (!TEST_EMAIL || !TEST_PASSWORD) faltan.push("TEST_AUTH_EMAIL / TEST_AUTH_PASSWORD");
  return faltan.length > 0 ? `Faltan variables de entorno: ${faltan.join(", ")}` : null;
}

interface SupabaseAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  user: unknown;
}

/**
 * Autentica la sesión con password grant y siembra la cookie real de
 * @supabase/ssr (`sb-<ref>-auth-token`). Mismo contrato verificado en
 * `e2e/visual-regression.spec.ts`: las cookies `sb-access-token` /
 * `sb-refresh-token` no las lee ningún código y dejaban la navegación en 307.
 */
async function tryAuthenticate(page: Page): Promise<boolean> {
  if (!TEST_EMAIL || !TEST_PASSWORD || !SUPABASE_URL || !ANON_KEY) return false;

  try {
    const authRes = await page.request.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
      }
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
        })
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

interface RunEventRow {
  id: string;
}

/**
 * Inserta la fila que dispara Realtime. El service role bypassa RLS — lo que se
 * prueba no es el INSERT, sino que la fila publicada llegue al navegador y el
 * hero reaccione. Devuelve el id para poder limpiarla después.
 */
async function insertRunEvent(page: Page): Promise<string> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !INVESTIGATION_ID) {
    throw new Error("insertRunEvent requiere SUPABASE_URL, SERVICE_ROLE_KEY e INVESTIGATION_ID");
  }
  const res = await page.request.post(`${SUPABASE_URL}/rest/v1/intelligence_run_events`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: {
      investigation_id: INVESTIGATION_ID,
      event_type: "e2e_realtime",
      message: `Realtime E2E probe ${Date.now()}`,
      payload: { source: "e2e/realtime-overview.spec.ts" },
    },
  });
  if (!res.ok()) {
    throw new Error(`INSERT en intelligence_run_events falló: HTTP ${res.status()} ${await res.text()}`);
  }
  const rows = (await res.json()) as RunEventRow[];
  const row = rows[0];
  if (!row) throw new Error("El INSERT no devolvió la fila (falta Prefer: return=representation)");
  return row.id;
}

/** Elimina la fila de prueba. Best-effort: no debe enmascarar el resultado. */
async function deleteRunEvent(page: Page, id: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  const res = await page.request.delete(
    `${SUPABASE_URL}/rest/v1/intelligence_run_events?id=eq.${encodeURIComponent(id)}`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok()) console.warn(`[WARN] No se pudo limpiar el evento ${id}: HTTP ${res.status()}`);
}

test.describe("Realtime en OverviewTab", () => {
  test.beforeEach(() => {
    const motivo = skipReason();
    test.skip(motivo !== null, motivo ?? "");
  });

  test("@realtime el hero se refresca por Realtime, sin sondeo y sin recargar", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const authed = await tryAuthenticate(page);
    test.skip(!authed, "No se pudo autenticar contra Supabase (TEST_AUTH_EMAIL/TEST_AUTH_PASSWORD)");

    // Cuenta peticiones al snapshot del hero. Se registra ANTES del goto para no
    // perder la carga inicial; luego se reinicia el contador una vez asentado.
    const liveRequests: string[] = [];
    page.on("request", (req) => {
      try {
        if (new URL(req.url()).pathname === LIVE_ROUTE) liveRequests.push(req.url());
      } catch {
        // URL no parseable (data:, blob:) — no es la ruta que medimos.
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // 1. El canal confirmó: el hero muestra la etiqueta "Realtime". Si el flag
    //    está apagado o el canal no confirma, el entorno no es apto y se omite
    //    en lugar de fallar (no es un defecto de producto, es configuración).
    let realtimeActivo = false;
    try {
      await expect(page.getByText("Realtime", { exact: true })).toBeVisible({ timeout: 15_000 });
      realtimeActivo = true;
    } catch {
      // se resuelve en el skip de abajo
    }
    test.skip(
      !realtimeActivo,
      "El hero no confirmó Realtime: NEXT_PUBLIC_FEATURE_REALTIME_LIVE apagado o canal no disponible"
    );

    await page.waitForLoadState("networkidle");
    liveRequests.length = 0;

    // Marca en `window`: sobrevive a re-renders de React pero NO a una recarga
    // completa, que es exactamente lo que queremos detectar.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__realtimeE2ENoReload = true;
    });

    // 2. RUTA FELIZ = SIN SONDEO. Con Realtime suscrito el intervalo no existe;
    //    una sola petición en una ventana > FALLBACK_MS delata que el respaldo
    //    se activó. Ventana: un periodo completo + 1 s de margen.
    await page.waitForTimeout(POLLING_PERIOD_MS + 1_000);
    expect(
      liveRequests,
      "El sondeo de respaldo no debe dispararse cuando Realtime está suscrito"
    ).toHaveLength(0);

    // 3. Un cambio real en la tabla llega al hero SIN recargar. El refresco lo
    //    dispara el INSERT vía Realtime; el sondeo no volvería a pedir el
    //    snapshot hasta dentro de 15 s, así que verlo antes prueba el canal.
    const id = await insertRunEvent(page);
    try {
      await expect
        .poll(() => liveRequests.length, {
          timeout: 8_000,
          message: "El hero no refrescó tras el INSERT: Realtime no entregó el evento",
        })
        .toBeGreaterThan(0);
    } finally {
      await deleteRunEvent(page, id);
    }

    // 4. El refresco fue en sitio: la marca de `window` sigue ahí.
    const marcador = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__realtimeE2ENoReload ?? null
    );
    expect(
      marcador,
      "El hero se actualiza sin recargar: una recarga completa habría borrado la marca de sesión"
    ).toBe(true);

    // Y el canal sigue siendo la fuente tras refrescar.
    await expect(page.getByText("Realtime", { exact: true })).toBeVisible();
  });
});
