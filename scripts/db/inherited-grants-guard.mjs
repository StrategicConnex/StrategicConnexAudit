#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Guard anti-regresión de grants peligrosos heredados.

   PROBLEMA QUE CIERRA: el event trigger `pgrst_ddl_watch` de Supabase concede
   `DELETE`/`TRIGGER`/`REFERENCES` (entre otros) a `authenticated` en cada tabla
   nueva de `public`. Sin un gate, una tabla sensible futura nacía con esos
   permisos y nadie se enteraba. Verificado el 2026-10-13: 52 de 79 tablas ya
   los tenían (deuda heredada), `anon` en ninguna.

   ESTRATEGIA: baseline congelado, no allowlist. Exigir limpiar las 52 sería
   otro trabajo; el guard congela el estado actual y falla si aparece una tabla
   NUEVA con esos grants o si una tabla congelada GANA uno. Una reducción se
   reporta como mejora y se consolida con `--snapshot` en su commit.

   Uso normal (gate, requiere DIRECT_URL o DATABASE_URL):
     node scripts/db/inherited-grants-guard.mjs
   Diagnosticar sin fallar:
     node scripts/db/inherited-grants-guard.mjs --print-baseline
   Re-congelar tras una revisión aprobada:
     node scripts/db/inherited-grants-guard.mjs --snapshot

   Exit codes: 0 sin regresión · 1 regresión/ cambio sin congelar · 2 no se pudo
   verificar (sin credenciales o sin conexión). Un guard que devolviera 0 al no
   poder verificar sería peor que ninguno.

   SOLO LECTURA: no modifica la base (usa `REVOKE` en migraciones, nunca aquí).
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import pg from "pg";
import { connectionFor } from "../lib/db-connection.mjs";
import {
  DANGEROUS_PRIVILEGES,
  buildGrantMap,
  diffGrants,
  formatDiscrepancy,
} from "./inherited-grants-patterns.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_PATH = path.join(ROOT, ".inherited-grants-threshold.json");

const SNAPSHOT = process.argv.includes("--snapshot") || process.argv.includes("-s");
const PRINT_BASELINE = process.argv.includes("--print-baseline") || process.argv.includes("--pb");

/* ── entorno ───────────────────────────────────────────────────────────── */
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").split("\\$").join("$");
if (!dbUrl) {
  console.error("❌ inherited-grants-guard: DIRECT_URL/DATABASE_URL no definida — no se puede verificar.");
  process.exit(2);
}

/* ── medición (solo lectura) ───────────────────────────────────────────── */
async function measure() {
  const client = new pg.Client(connectionFor(dbUrl));
  await client.connect();
  try {
    const { rows } = await client.query(
      `select g.table_name, g.privilege_type
         from information_schema.role_table_grants g
         join information_schema.tables t
           on t.table_name = g.table_name and t.table_schema = g.table_schema
        where g.table_schema = 'public'
          and t.table_type = 'BASE TABLE'
          and g.grantee = 'authenticated'
          and g.privilege_type = any($1)
        order by g.table_name, g.privilege_type`,
      [DANGEROUS_PRIVILEGES],
    );
    return buildGrantMap(rows);
  } finally {
    await client.end();
  }
}

let current;
try {
  current = await measure();
} catch (error) {
  console.error("❌ inherited-grants-guard: no se pudo consultar la base —", error.message);
  process.exit(2);
}

/* ── snapshot ──────────────────────────────────────────────────────────── */
if (SNAPSHOT) {
  const payload = {
    _comment:
      "Baseline de grants peligrosos (DELETE/TRIGGER/REFERENCES) que `authenticated` " +
      "tiene en tablas de public, heredados del event trigger pgrst_ddl_watch de Supabase. " +
      "Re-congela con `--snapshot` tras una revisión aprobada (ver scripts/db/inherited-grants-guard.mjs).",
    _updated: new Date().toISOString().slice(0, 10),
    dangerousPrivileges: DANGEROUS_PRIVILEGES,
    baseline: current,
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n");
  const n = Object.keys(current).length;
  console.log(`Snapshot: ${n} tablas con grants peligrosos congeladas en .inherited-grants-threshold.json`);
  process.exit(0);
}

/* ── baseline ──────────────────────────────────────────────────────────── */
let baseline = {};
try {
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  baseline = parsed.baseline ?? {};
} catch (error) {
  console.error(`❌ inherited-grants-guard: no se pudo leer ${path.basename(BASELINE_PATH)} — ${error.message}`);
  process.exit(2);
}

if (PRINT_BASELINE) {
  console.log(
    JSON.stringify(
      {
        baselineTables: Object.keys(baseline).length,
        currentTables: Object.keys(current).length,
        discrepancies: diffGrants(baseline, current),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

/* ── gate ──────────────────────────────────────────────────────────────── */
const discrepancias = diffGrants(baseline, current);

if (discrepancias.length > 0) {
  console.error("❌ inherited-grants-guard: se detectó una regresión de grants\n");
  for (const d of discrepancias) console.error(`   - ${formatDiscrepancy(d)}`);
  console.error(
    "\n💡 Una tabla nueva heredó grants peligrosos del event trigger pgrst_ddl_watch de Supabase. " +
      "Revócalos con REVOKE (DELETE/TRIGGER/REFERENCES) y re-congela con --snapshot en ese commit; " +
      "si una tabla los necesita de verdad, re-congela justificándolo en el commit.",
  );
  process.exit(1);
}

console.log("✅ inherited-grants-guard: OK — sin tablas nuevas con grants peligrosos");
console.log(
  `   tablas con DELETE/TRIGGER/REFERENCES: ${Object.keys(current).length} (congeladas; revocación pendiente de abordar por tabla)`,
);
process.exit(0);
