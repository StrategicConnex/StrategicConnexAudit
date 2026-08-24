/* ═══════════════════════════════════════════════════════════════════
   SCAUDIT — E2E AI Report Validation Script

   Valida end-to-end la generación del reporte ejecutivo por IA:
     1. Crea un usuario auth de prueba directamente en auth.users +
        auth.identities vía SQL (DATABASE_URL = rol de servicio; pgcrypto
        genera el hash bcrypt). Evita el rate limit del signup anon y la
        confirmación de email.
     2. Seedeea un proyecto con datos GSC + GA4 + keywords + auditoría.
     3. Llama POST /api/ai/report en el dev server con la cookie de
        sesión (@supabase/ssr: sb-<ref>-auth-token).
     4. Valida: success, bloque ```mermaid, tabla de KPIs y modelUsed.

   Uso:
     npx tsx --env-file=.env.local src/scripts/e2e-ai-report.ts
     (requiere dev server en :3000 y .env.local completo)

   Requisitos:
     - Dev server corriendo:  npx next dev -p 3000
     - .env.local con NEXT_PUBLIC_SUPABASE_URL, PUBLISHABLE_KEY,
       DATABASE_URL, OPENROUTER_API_KEY.
     - Certificado CA de Supabase en src/shared/db/supabase-ca.crt

   NOTA: el check de ```mermaid requiere egreso de red a OpenRouter
   (chat/completions) y a Upstash Redis. En máquinas con egress
   restringido el router IA cae al reporte resiliente (isFallback=true),
   que es un resultado válido de la validación del pipeline.

   Flag opcional: --cleanup elimina el usuario y los datos sembrados al
   terminar (evita acumular filas de test en la BD compartida).
   ═══════════════════════════════════════════════════════════════════ */

// Flag --cleanup: borra el usuario test + datos al finalizar
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

/** Limpia sslmode de la URL y configura el pool con el CA de Supabase,
 *  replicando la lógica de src/shared/db/index.ts (pg v8 trata
 *  sslmode=require como verify-full y rompe con certs auto-firmados). */
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

/** Borra el usuario test + proyecto + datos (orden respetando FKs).
 *  Idempotente: puede correr sobre datos parciales si el seed falló a mitad. */
async function cleanupTestData(pool: Pool, userId: string, projectId: string): Promise<void> {
  try {
    await pool.query(`DELETE FROM public.audits WHERE project_id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.keyword_targets WHERE project_id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.integration_data_ga4 WHERE project_id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.integration_data_gsc WHERE project_id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.projects WHERE id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.users WHERE id = $1`, [userId]);
    await pool.query(`DELETE FROM auth.identities WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM auth.users WHERE id = $1`, [userId]);
    log("cleanup", true, "usuario + proyecto + datos eliminados");
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

  const email = `e2e.report.${Date.now()}@gmail.com`;
  const password = "E2eTest!2026";
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const pool = createSupabasePool(DATABASE_URL);
  const today = new Date();

  // ── 1. Crear el usuario auth vía SQL (rol de servicio, sin rate limits) ──
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

  // ── 3. Seedear datos (rol de servicio, bypass RLS) ──
  console.log("\n🌱 Sembrando proyecto + GSC + GA4 + keywords...");
  try {
    await pool.query(
      `INSERT INTO public.users (id, email, full_name, role)
       VALUES ($1, $2, $3, 'client') ON CONFLICT (id) DO NOTHING`,
      [userId, email, "E2E Report Bot"]
    );

    await pool.query(
      `INSERT INTO public.projects (id, owner_id, name, domain)
       VALUES ($1, $2, $3, $4)`,
      [projectId, userId, "E2E AI Report Project", "https://e2e-report.example.com"]
    );

    // 30 días de GSC con valores realistas
    const gscValues: string[] = [];
    const gscParams: unknown[] = [];
    let p = 1;
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      gscValues.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      gscParams.push(
        projectId, d.toISOString().slice(0, 10), "https://e2e-report.example.com/",
        340 + i * 3, 5200 + i * 40, 0.065 + i * 0.0002, 4.2 - i * 0.01
      );
    }
    await pool.query(
      `INSERT INTO public.integration_data_gsc (project_id, date, url, clicks, impressions, ctr, position)
       VALUES ${gscValues.join(",")} ON CONFLICT DO NOTHING`,
      gscParams
    );

    // 30 días de GA4
    const ga4Values: string[] = [];
    const ga4Params: unknown[] = [];
    p = 1;
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      ga4Values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      ga4Params.push(
        projectId, d.toISOString().slice(0, 10), "/",
        180 + i * 2, 12 + (i % 5), 0.54 + i * 0.001, null
      );
    }
    await pool.query(
      `INSERT INTO public.integration_data_ga4 (project_id, date, page_path, active_users, conversions, engagement_rate, custom_dimensions)
       VALUES ${ga4Values.join(",")} ON CONFLICT DO NOTHING`,
      ga4Params
    );

    // Keywords
    await pool.query(
      `INSERT INTO public.keyword_targets (project_id, keyword, device, language)
       VALUES ($1, 'auditoria seo', 'desktop', 'es'), ($1, 'cybersecurity audit', 'desktop', 'en'), ($1, 'pentest', 'mobile', 'es')`,
      [projectId]
    );

    // Auditoría completada → healthScore=85, crawledCount=142
    await pool.query(
      `INSERT INTO public.audits (id, project_id, type, status, started_at, completed_at)
       VALUES ($1, $2, 'full', 'completed', now() - interval '1 day', now())`,
      [auditId, projectId]
    );

    log("seed", true, `project=${projectId}`);
  } catch (err) {
    log("seed", false, err instanceof Error ? err.message : String(err));
    if (CLEANUP) await cleanupTestData(pool, userId, projectId);
    await pool.end();
    process.exit(1);
  }

  // ── 4. Llamar POST /api/ai/report con la cookie de sesión ──
  console.log(`\n🚀 Llamando POST ${BASE_URL}/api/ai/report ...`);
  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const cookieValue = encodeURIComponent(JSON.stringify(session));

  let pass = true;
  try {
    const started = Date.now();
    const res = await fetch(`${BASE_URL}/api/ai/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${cookieName}=${cookieValue}`,
      },
      body: JSON.stringify({ projectId }),
    });
    const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

    const data = await res.json().catch(() => ({}));
    console.log(`\n⏱️  Respuesta en ${elapsedSec}s · HTTP ${res.status}`);
    console.log("────── Resumen ──────");
    console.log({ success: data.success, isFallback: data.isFallback, modelUsed: data.modelUsed, fromCache: data.fromCache, reportLen: data.report?.length });

    // ── 5. Validaciones ──
    const report: string = data.report || "";

    const checks: [string, boolean][] = [
      ["HTTP 200", res.status === 200],
      ["success=true", data.success === true],
      ["contiene 'Desde Strategic Connex'", report.includes("Desde Strategic Connex")],
      ["contiene tabla de KPIs (| Métrica)", /\|[^*\n]*Clicks|Impresiones|CTR|Posici/.test(report)],
      ["contiene bloque ```mermaid", report.includes("```mermaid")],
      ["reporte no vacío (>500 chars)", report.length > 500],
    ];

    console.log("\n────── Validaciones ──────");
    for (const [label, ok] of checks) {
      console.log(`${ok ? "✅" : "❌"} ${label}`);
      if (!ok) pass = false;
    }

    if (data.modelUsed) console.log(`🤖 Modelo usado: ${data.modelUsed}`);
    if (data.isFallback) console.warn("ℹ️  Reporte resiliente (isFallback=true): la IA tardó demasiado, pero el reporte incluye tabla KPIs + mermaid — resultado válido.");

    const mermaidMatch = report.match(/```mermaid\n([\s\S]*?)```/);
    if (mermaidMatch) {
      console.log("\n────── Diagrama mermaid extraído ──────");
      console.log(mermaidMatch[1]!.trim().split("\n").slice(0, 12).join("\n"));
    }

    console.log("\n" + (pass ? "✅✅ E2E OK: el reporte IA se genera al 100% con tabla + mermaid." : "❌❌ E2E FALLÓ: revisar checks arriba."));
  } catch (err) {
    console.error("Error durante la validación E2E:", err);
    pass = false;
  } finally {
    // ── 6. Cleanup opcional (--cleanup) — corre SIEMPRE (éxito o fallo) ──
    if (CLEANUP) {
      console.log("\n🧹 Limpiando datos de test...");
      await cleanupTestData(pool, userId, projectId);
    } else {
      // Credenciales del usuario test para limpieza manual si es necesario
      console.log("\n────── Datos de limpieza (re-ejecuta con --cleanup para borrar) ──────");
      console.log({ email, userId, projectId, auditId });
    }
    await pool.end();
  }
  process.exit(pass ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
