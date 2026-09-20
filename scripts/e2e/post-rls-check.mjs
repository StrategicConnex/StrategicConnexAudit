/**
 * post-rls-check.mjs — E2E de validación post-RLS contra producción.
 *
 * Flujo: auth vía password grant → cookies en el contexto HTTP → ejercita los
 * flujos autenticados que atraviesan RLS: dashboard (proyectos), members API,
 * export, intelligence. Valida también el aislamiento cross-tenant.
 *
 * Uso: node scripts/e2e/post-rls-check.mjs [baseUrl]
 * Requiere .e2e-user-tmp.json con { email, password, access_token, refresh_token, userId }
 * y .env.local con NEXT_PUBLIC_SUPABASE_URL/KEY y DIRECT_URL.
 */
import fs from "node:fs";
import pg from "pg";

const BASE = process.argv[2] ?? "https://scaudit.vercel.app";
const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const user = JSON.parse(fs.readFileSync(".e2e-user-tmp.json", "utf8"));
const userId = user.userId;

// ── helpers BD (conexión de servicio para setup/teardown) ──
let dbUrl = (env.DIRECT_URL || env.DATABASE_URL || "").split("\\$").join("$");
try {
  const parsed = new URL(dbUrl);
  parsed.searchParams.delete("sslmode");
  dbUrl = parsed.toString();
} catch {}
let ca;
try {
  ca = fs.readFileSync("src/shared/db/supabase-ca.crt", "utf8");
} catch {}
const svc = async () => {
  const c = new pg.Client({ connectionString: dbUrl, ssl: ca ? { ca } : false });
  await c.connect();
  return c;
};

// ── 1. Refrescar sesión (password grant) ──
const grant = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
  {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: user.email, password: user.password }),
  }
);
const session = await grant.json();
if (!session.access_token) {
  console.error("❌ Auth falló:", session.msg ?? grant.status);
  process.exit(1);
}
console.log("✅ Sesión Supabase activa para", user.email);

// @supabase/ssr v0.10 usa UNA cookie `sb-<ref>-auth-token` con la sesión JSON
// (los nombres sb-access-token/sb-refresh-token son del auth-helpers antiguo).
const supaRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const authCookieName = `sb-${supaRef}-auth-token`;
const authCookieValue = JSON.stringify(session);
const results = [];
const record = (flow, check, ok, note = "") =>
  results.push({ flow, check, ok, note });

// ── 2. Asegurar fila users pública + proyecto de prueba ──
{
  const c = await svc();
  // El user-sync del dashboard crea la fila users al primer login; para los
  // flujos API directos la insertamos aquí (idéntico al flujo de la app).
  const free = await c.query("SELECT id FROM subscription_plans WHERE name = 'free'");
  await c.query(
    `INSERT INTO users (id, email, full_name, plan_id)
     VALUES ($1, $2, 'E2E RLS User', $3)
     ON CONFLICT (id) DO NOTHING`,
    [userId, user.email, free.rows[0]?.id ?? null]
  );
  const existing = await c.query(
    "SELECT id, name FROM projects WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  if (existing.rows.length > 0) {
    user.projectId = existing.rows[0].id;
    console.log("Proyecto existente:", existing.rows[0].name);
  } else {
    const ins = await c.query(
      `INSERT INTO projects (name, domain, owner_id)
       VALUES ('E2E RLS Check', 'https://example.com', $1)
       RETURNING id`,
      [userId]
    );
    user.projectId = ins.rows[0].id;
    console.log("Proyecto de prueba creado:", ins.rows[0].id);
  }
  await c.end();
  fs.writeFileSync(".e2e-user-tmp.json", JSON.stringify(user));
}
const projectId = user.projectId;

// ── helper fetch autenticado ──
async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      cookie: `${authCookieName}=${encodeURIComponent(authCookieValue)}`,
      ...(init.headers ?? {}),
    },
    redirect: "manual",
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, location: res.headers.get("location") };
}

// ══ FLUJO A: Dashboard / proyectos ═══════════════════════════════════════
{
  const r = await api("/");
  record(
    "dashboard",
    "GET / (dashboard de proyectos) autenticado",
    r.status === 200 && !r.location?.includes("/login"),
    `HTTP ${r.status}${r.location ? " → " + r.location : ""}`
  );
}

// ══ FLUJO B: Members API (identidades vía servicio dentro de RLS) ════════
{
  const r = await api(`/api/projects/${projectId}/members`);
  const ok = r.status === 200 && r.body?.success === true;
  record(
    "equipo",
    "GET /api/projects/:id/members",
    ok,
    ok
      ? `owner=${r.body.members[0]?.email ?? "—"} miembros=${r.body.members.length} invitaciones=${r.body.invitations.length}`
      : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`
  );
}

// ══ FLUJO C: Export (withRLS + datos del proyecto) ═══════════════════════
{
  const r = await api(
    `/api/export?projectId=${projectId}&format=json&resource=findings`
  );
  const ok = r.status === 200;
  record(
    "exports",
    "GET /api/export?projectId=…&resource=findings",
    ok,
    ok
      ? `filas=${Array.isArray(r.body) ? r.body.length : JSON.stringify(r.body).slice(0, 80)}`
      : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`
  );
}

// ══ FLUJO D: Intelligence (live + investigations) ════════════════════════
{
  const r = await api(`/api/intelligence/live?projectId=${projectId}`);
  const ok = r.status === 200;
  record(
    "intelligence",
    "GET /api/intelligence/live",
    ok,
    ok ? "OK" : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`
  );
  const r2 = await api(`/api/intelligence/investigations?projectId=${projectId}`);
  record(
    "intelligence",
    "GET /api/intelligence/investigations",
    r2.status === 200,
    `HTTP ${r2.status}`
  );
}

// ══ FLUJO E: Aislamiento cross-tenant (proyecto ajeno) ═══════════════════
{
  const c = await svc();
  const other = await c.query(
    "SELECT id FROM projects WHERE owner_id <> $1 AND is_deleted = false LIMIT 1",
    [userId]
  );
  await c.end();
  if (other.rows.length > 0) {
    const foreignId = other.rows[0].id;
    const r = await api(`/api/projects/${foreignId}/members`);
    const blocked = r.status === 404 || r.body?.success === false;
    record(
      "aislamiento",
      "members de proyecto AJENO → denegado",
      blocked,
      `HTTP ${r.status} (esperado 404)`
    );
    const r2 = await api(
      `/api/export?projectId=${foreignId}&format=json&resource=findings`
    );
    const blocked2 = r2.status === 404 || r2.status === 403 || (Array.isArray(r2.body) ? r2.body.length === 0 : true);
    record(
      "aislamiento",
      "export de proyecto AJENO → vacío/denegado",
      blocked2,
      `HTTP ${r2.status}`
    );
  } else {
    record("aislamiento", "proyecto ajeno para test", false, "no hay otros proyectos en BD");
  }
}

// ══ Resumen ══════════════════════════════════════════════════════════════
console.log("\n═══════ RESULTADOS E2E POST-RLS ═══════");
let fails = 0;
for (const r of results) {
  if (!r.ok) fails++;
  console.log(`${r.ok ? "✅" : "❌"} [${r.flow}] ${r.check}${r.note ? " — " + r.note : ""}`);
}
console.log(`\n${fails === 0 ? "🎉 TODOS LOS FLUJOS OK" : `⚠️  ${fails} FALLO(S)`}`);
fs.writeFileSync(
  ".e2e-results-tmp.json",
  JSON.stringify(results, null, 2)
);
process.exit(fails === 0 ? 0 : 1);
