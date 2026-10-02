#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Recheck del sink de errores `app_logs` (ADR-007).

   Consulta el historial de errores de la app con retención ilimitada, en
   sustitución de la ventana de minutos de `vercel logs` (que ignora
   `--since` y sólo retiene los últimos minutos). Pensado para los
   rechecks T+5m/T+24h post-push: 0 entradas de error en la ventana.

   Uso:
     node scripts/db/app-logs-check.mjs                 # últimas 24h
     node scripts/db/app-logs-check.mjs --hours 48      # ventana ampliada
     node scripts/db/app-logs-check.mjs --fail-on-error # exit 1 si hay errores
     node scripts/db/app-logs-check.mjs --json          # salida JSON para CI

   Variables: DIRECT_URL (o DATABASE_URL) en .env.local o entorno.
   En CI (sin .env.local): exporta DIRECT_URL antes de invocar.
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import pg from "pg";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const AS_JSON = process.argv.includes("--json");
const FAIL_ON_ERROR = process.argv.includes("--fail-on-error");
const hoursIdx = process.argv.indexOf("--hours");
const limitIdx = process.argv.indexOf("--limit");
const HOURS = hoursIdx !== -1 ? Number(process.argv[hoursIdx + 1]) : 24;
const LIMIT = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : 10;
if (!Number.isFinite(HOURS) || HOURS <= 0 || !Number.isFinite(LIMIT) || LIMIT <= 0) {
  console.error("❌ --hours/--limit deben ser números positivos");
  process.exit(1);
}

const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").split("\\$").join("$");
if (!dbUrl) {
  console.error("❌ DIRECT_URL/DATABASE_URL no definida");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

try {
  const total = await client.query(
    "select count(*)::int as n from app_logs where created_at > now() - ($1 || ' hours')::interval",
    [String(HOURS)],
  );
  const bySource = await client.query(
    "select source, count(*)::int as n from app_logs where created_at > now() - ($1 || ' hours')::interval group by 1 order by 2 desc",
    [String(HOURS)],
  );
  const byCode = await client.query(
    "select coalesce(code, '(sin código)') as code, count(*)::int as n from app_logs where created_at > now() - ($1 || ' hours')::interval group by 1 order by 2 desc limit 10",
    [String(HOURS)],
  );
  const sensitive = await client.query(
    "select count(*)::int as n from app_logs where created_at > now() - ($1 || ' hours')::interval and (code = '42501' or message ilike '%42501%' or message ilike '%permission denied%')",
    [String(HOURS)],
  );
  const recent = await client.query(
    "select created_at, level, source, code, path, left(message, 200) as message from app_logs where created_at > now() - ($1 || ' hours')::interval order by created_at desc limit $2",
    [String(HOURS), String(LIMIT)],
  );

  const errors = total.rows[0].n;
  const payload = {
    window_hours: HOURS,
    total: errors,
    by_source: Object.fromEntries(bySource.rows.map((r) => [r.source, r.n])),
    by_code: Object.fromEntries(byCode.rows.map((r) => [r.code, r.n])),
    permission_denied_42501: sensitive.rows[0].n,
    recent: recent.rows,
  };

  if (AS_JSON) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`app_logs — últimos ${HOURS}h`);
    console.log(`  total errores: ${errors}`);
    console.log(`  por source: ${bySource.rows.map((r) => `${r.source}=${r.n}`).join(", ") || "(ninguno)"}`);
    console.log(`  por code: ${byCode.rows.map((r) => `${r.code}=${r.n}`).join(", ") || "(ninguno)"}`);
    console.log(`  42501/permission denied: ${payload.permission_denied_42501}`);
    if (recent.rows.length > 0) {
      console.log(`  últimas ${recent.rows.length} filas:`);
      for (const row of recent.rows) {
        console.log(
          `    ${row.created_at.toISOString()} | ${row.source} | ${row.code ?? "-"} | ${row.path ?? "-"} | ${row.message}`,
        );
      }
    }
  }

  if (FAIL_ON_ERROR && errors > 0) {
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
