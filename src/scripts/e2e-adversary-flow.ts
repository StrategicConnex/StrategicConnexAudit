/* ═══════════════════════════════════════════════════════════════════
   SCAUDIT — E2E Adversary Flow Validation Script

   Valida end-to-end el módulo de simulación de adversarios:
     1. Crea un usuario auth de prueba directamente en auth.users +
        auth.identities vía SQL (rol de servicio; pgcrypto genera el
        hash bcrypt). Evita rate limits y confirmación de email.
     2. Seedeea un proyecto de prueba.
     3. GET  /api/intelligence/adversary?projectId= → catálogo carga
        (regresión del "Error al cargar escenarios").
     4. POST /api/intelligence/adversary { scenarioMitreId, projectId }
        → crea run con scenario_id persistido (fix P0).
     5. PATCH /api/intelligence/adversary { runId, result } → detected.
     6. GET nuevamente → stats por escenario correctas (totalRuns,
        detectedCount, detectionRate) y coverage.executedScenarios=1.

   Uso:
     npx tsx --env-file=.env.local src/scripts/e2e-adversary-flow.ts
     (requiere dev server en :3000 y .env.local completo)

   Flag opcional: --cleanup elimina el usuario + datos al terminar.
   ═══════════════════════════════════════════════════════════════════ */

const CLEANUP = process.argv.includes("--cleanup");

import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";

const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0];
  } catch {
    return "";
  }
})();

// ─── Helpers ────────────────────────────────────────────────────────

function log(step: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} [${step}] ${detail}`);
}

function createSupabasePool(connectionString: string): Pool {
  let cleanUrl = connectionString;
  try {
    const parsed = new URL(connectionString);
    parsed.searchParams.delete("sslmode");
    cleanUrl = parsed.toString();
  } catch {
    /* keep original */
  }

  const caPath = path.join(process.cwd(), "src/shared/db/supabase-ca.crt");
  let ca: string | undefined;
  try {
    ca = fs.readFileSync(caPath, "utf8");
  } catch {
    /* CA optional */
  }

  return new Pool({
    connectionString: cleanUrl,
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
}

async function cleanupTestData(pool: Pool, userId: string, projectId: string): Promise<void> {
  try {
    await pool.query(`DELETE FROM public.adversary_runs WHERE project_id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.intelligence_findings WHERE project_id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.projects WHERE id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.users WHERE id = $1`, [userId]);
    await pool.query(`DELETE FROM auth.identities WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM auth.users WHERE id = $1`, [userId]);
    log("cleanup", true, "usuario + proyecto + runs + findings eliminados");
  } catch (err) {
    log("cleanup", false, err instanceof Error ? err.message : String(err));
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !ANON_KEY || !DATABASE_URL) {
    console.error("Faltan env vars: NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY / DATABASE_URL");
    process.exit(1);
  }

  // Preflight: el dev server debe estar arriba
  try {
    const probe = await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(5000) });
    if (probe.status >= 500) throw new Error(`dev server respondió ${probe.status}`);
    log("preflight", true, `${BASE_URL} alcanzable`);
  } catch {
    log("preflight", false, `¿Levantaste el dev server?  npx next dev -p 3000  (o setea E2E_BASE_URL)`);
    process.exit(1);
  }

  const email = `e2e.adversary.${Date.now()}@gmail.com`;
  const password = "E2eTest!2026";
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const pool = createSupabasePool(DATABASE_URL);

  // Escenario manual → sin probes de red reales (E2E determinista)
  const SCENARIO_MITRE_ID = "T1078.001";
  const OTHER_SCENARIO = "T1046";

  // ── 1. Crear el usuario auth vía SQL (rol de servicio) ──
  console.log(`\n🔐 Creando usuario test vía SQL: ${email}`);
  try {
    await pool.query(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, confirmation_token, email_change,
         email_change_token_new, recovery_token, is_sso_user, is_anonymous
       ) VALUES (
         '00000000-0000-0000-0000-000000000000', $1::uuid, 'authenticated', 'authenticated', $2,
         crypt($3, gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}', '{}',
         now(), now(), '', '', '', '', false, false
       )`,
      [userId, email, password]
    );
    await pool.query(
      `INSERT INTO auth.identities (
         provider_id, id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
       ) VALUES (
         $1::text, $1::uuid, $1::uuid, jsonb_build_object('sub', $1::text, 'email', $2::text), 'email', now(), now(), now()
       )`,
      [userId, email]
    );
    log("create-user-sql", true, userId);
  } catch (err) {
    log("create-user-sql", false, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── 2. Firmar con password para obtener la sesión real ──
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signInData.session) {
    console.error("Login con password falló:", signInError?.message || "sin sesión");
    if (CLEANUP) await cleanupTestData(pool, userId, projectId);
    await pool.end();
    process.exit(1);
  }
  const session = signInData.session;
  log("signin-password", true, email);

  // ── 3. Seedear usuario public + proyecto ──
  console.log("\n🌱 Sembrando proyecto de prueba...");
  try {
    await pool.query(
      `INSERT INTO public.users (id, email, full_name, role)
       VALUES ($1, $2, $3, 'client') ON CONFLICT (id) DO NOTHING`,
      [userId, email, "E2E Adversary Bot"]
    );
    await pool.query(
      `INSERT INTO public.projects (id, owner_id, name, domain)
       VALUES ($1, $2, $3, $4)`,
      [projectId, userId, "E2E Adversary Project", "https://e2e-adversary.example.com"]
    );
    log("seed", true, `project=${projectId}`);
  } catch (err) {
    log("seed", false, err instanceof Error ? err.message : String(err));
    if (CLEANUP) await cleanupTestData(pool, userId, projectId);
    await pool.end();
    process.exit(1);
  }

  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const cookieValue = encodeURIComponent(JSON.stringify(session));
  const headers = {
    "Content-Type": "application/json",
    Cookie: `${cookieName}=${cookieValue}`,
  };

  let pass = true;

  /** Imprime y evalúa un set de checks de una sección (patrón e2e-ai-report.ts:
   *  array fresco por sección — evita consumir checks de otra sección). */
  function section(title: string, items: Array<[string, boolean]>) {
    console.log(`\n────── ${title} ──────`);
    for (const [label, ok] of items) {
      console.log(`${ok ? "✅" : "❌"} ${label}`);
      if (!ok) pass = false;
    }
  }

  try {
    // ── 4. GET: catálogo carga sin errores ──
    console.log(`\n🚀 GET ${BASE_URL}/api/intelligence/adversary?projectId=...`);
    const get1 = await fetch(`${BASE_URL}/api/intelligence/adversary?projectId=${projectId}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const get1Data = await get1.json().catch(() => ({}));

    section("Validaciones GET", [
      ["GET HTTP 200", get1.status === 200],
      ["GET success=true", get1Data.success === true],
      ["GET catálogo con escenarios", Array.isArray(get1Data.catalog) && get1Data.catalog.length > 0],
      ["GET catálogo contiene T1078.001", Array.isArray(get1Data.catalog) && get1Data.catalog.some((s: { mitreId?: string }) => s.mitreId === SCENARIO_MITRE_ID)],
    ]);
    const catalogLen = Array.isArray(get1Data.catalog) ? get1Data.catalog.length : 0;
    console.log(`ℹ️  ${catalogLen} escenarios en catálogo`);

    // ── 5. POST: ejecutar escenario → run con scenario_id persistido ──
    console.log(`\n🚀 POST run ${SCENARIO_MITRE_ID}...`);
    const post = await fetch(`${BASE_URL}/api/intelligence/adversary`, {
      method: "POST",
      headers,
      body: JSON.stringify({ scenarioMitreId: SCENARIO_MITRE_ID, projectId }),
      signal: AbortSignal.timeout(30_000),
    });
    const postData = await post.json().catch(() => ({}));

    section("Validaciones POST", [
      ["POST HTTP 200", post.status === 200],
      ["POST success=true", postData.success === true],
      ["POST devuelve runId", typeof postData.runId === "string" && postData.runId.length > 0],
      ["POST output no vacío", typeof postData.output === "string" && postData.output.length > 0],
    ]);
    console.log(`ℹ️  runId=${postData.runId} · result=${postData.result} · scoreImpact=${postData.scoreImpact}`);

    // ── 6. PATCH: reportar detectado (solo detected: un PATCH→missed rompería
    //    los asserts de stats detectedCount=1 — la cobertura de "missed" la
    //    da el POST, que crea el run con result=missed por defecto). ──
    console.log(`\n🚀 PATCH run ${postData.runId} → detected...`);
    const patch = await fetch(`${BASE_URL}/api/intelligence/adversary`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ runId: postData.runId, result: "detected", detectedBy: "E2E" }),
      signal: AbortSignal.timeout(15_000),
    });
    const patchData = await patch.json().catch(() => ({}));

    section("Validaciones PATCH", [
      ["PATCH HTTP 200", patch.status === 200],
      ["PATCH success=true", patchData.success === true],
    ]);

    // ── 7. GET final: stats por escenario correctas ──
    console.log(`\n🚀 GET final (stats)...`);
    const get2 = await fetch(`${BASE_URL}/api/intelligence/adversary?projectId=${projectId}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const get2Data = await get2.json().catch(() => ({}));

    type CatalogScenario = { mitreId?: string; totalRuns?: number; detectedCount?: number; detectionRate?: number | null };
    const scenario = Array.isArray(get2Data.catalog)
      ? get2Data.catalog.find((s: CatalogScenario) => s.mitreId === SCENARIO_MITRE_ID)
      : null;
    const other = Array.isArray(get2Data.catalog)
      ? get2Data.catalog.find((s: CatalogScenario) => s.mitreId === OTHER_SCENARIO)
      : null;
    const coverage = get2Data.coverage || {};

    // El fix P0: el run debe atribuirse SOLO a su escenario, no a todos.
    section("Validaciones STATS", [
      ["stats: T1078.001 totalRuns=1", scenario?.totalRuns === 1],
      ["stats: T1078.001 detectedCount=1", scenario?.detectedCount === 1],
      ["stats: T1078.001 detectionRate=100", scenario?.detectionRate === 100],
      ["stats: T1046 totalRuns=0 (sin fuga)", other?.totalRuns === 0],
      ["coverage.executedScenarios=1 (scenario_id persistido)", coverage.executedScenarios === 1],
      ["coverage.detectedCount=1", coverage.detectedCount === 1],
      ["coverage.missedCount=0", coverage.missedCount === 0],
    ]);
    console.log(
      `ℹ️  T1078.001: ${scenario?.totalRuns} runs, ${scenario?.detectedCount} detected, ${scenario?.detectionRate}% rate`
    );
    console.log(
      `ℹ️  coverage: ${coverage.executedScenarios} executed, ${coverage.detectedCount} detected, ${coverage.missedCount} missed`
    );

    console.log("\n" + (pass ? "✅✅ E2E OK: flujo adversario completo (GET → POST → PATCH → stats correctas)." : "❌❌ E2E FALLÓ: revisar checks arriba."));
  } catch (err) {
    console.error("Error durante la validación E2E:", err);
    pass = false;
  } finally {
    if (CLEANUP) {
      console.log("\n🧹 Limpiando datos de test...");
      await cleanupTestData(pool, userId, projectId);
    } else {
      console.log("\n────── Datos de limpieza (re-ejecuta con --cleanup para borrar) ──────");
      console.log({ email, userId, projectId });
    }
    await pool.end();
  }
  process.exit(pass ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
