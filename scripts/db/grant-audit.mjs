#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Inventario de privilegios peligrosos (solo lectura).

   Cierra el hallazgo #6 de la auditoría de BD (2026-10-11): `TRUNCATE` estaba
   concedido a `authenticated` en 33 tablas de `public`. **TRUNCATE no pasa por
   RLS**, así que un usuario autenticado comprometido podía vaciar tablas de
   todos los tenants ignorando las policies.

   Este script es la verificación REAL contra la base (lo que
   `rls-inventory.mjs` no puede ver porque es estático) y afirma:

     ❌ HARD  alguna tabla de `public` concede TRUNCATE a `authenticated`/`anon`
     ❌ HARD  los default privileges de `public` conceden TRUNCATE a esos roles
              (las tablas futuras lo heredarían otra vez)

   Uso:
     node scripts/db/grant-audit.mjs            # informe + veredicto
     node scripts/db/grant-audit.mjs --json     # salida JSON para CI

   Variables: DIRECT_URL (o DATABASE_URL) en .env.local o entorno.
   Exit code: 0 si no hay privilegios peligrosos, 1 si los hay.
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import pg from "pg";
import { connectionFor } from "../lib/db-connection.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const AS_JSON = process.argv.includes("--json");

/** Roles expuestos a PostgREST: nunca deben poder truncar. */
const ROLES_EXPUESTOS = ["authenticated", "anon"];

const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").split("\\$").join("$");
if (!dbUrl) {
  console.error("❌ DIRECT_URL/DATABASE_URL no definida");
  process.exit(2);
}

const client = new pg.Client(connectionFor(dbUrl));

try {
  await client.connect();

  // 1. Privilegios efectivos por tabla.
  const { rows: grants } = await client.query(
    `SELECT grantee, table_name, privilege_type
       FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee = ANY($1::text[])
        AND privilege_type = 'TRUNCATE'
      ORDER BY grantee, table_name`,
    [ROLES_EXPUESTOS],
  );

  // 2. Default privileges: lo que heredarán las tablas FUTURAS.
  const { rows: defaults } = await client.query(
    `SELECT pg_get_userbyid(d.defaclrole) AS owner,
            a.grantee::regrole::text   AS grantee,
            a.privilege_type
       FROM pg_default_acl d
       JOIN pg_namespace n ON n.oid = d.defaclnamespace
       CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      WHERE n.nspname = 'public'
        AND a.grantee::regrole::text = ANY($1::text[])
        AND a.privilege_type = 'TRUNCATE'
      ORDER BY 2, 3`,
    [ROLES_EXPUESTOS],
  );

  // Contexto: cuántas tablas públicas existen (para dimensionar el hallazgo).
  const { rows: total } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );

  const hard = grants.length > 0 || defaults.length > 0;

  if (AS_JSON) {
    console.log(JSON.stringify({ publicTables: total[0].n, grants, defaults, hard }, null, 2));
  } else {
    console.log("═══ SCAUDIT — inventario de GRANT TRUNCATE ═══");
    console.log(`Tablas base en public: ${total[0].n}`);
    console.log("");
    if (grants.length > 0) {
      console.log(`❌ ${grants.length} tabla(s) conceden TRUNCATE a un rol expuesto:`);
      const porRol = new Map();
      for (const g of grants) porRol.set(g.grantee, [...(porRol.get(g.grantee) ?? []), g.table_name]);
      for (const [rol, tablas] of porRol) {
        console.log(`   · ${rol} (${tablas.length}): ${tablas.join(", ")}`);
      }
    } else {
      console.log("✅ Ninguna tabla de public concede TRUNCATE a authenticated/anon.");
    }
    console.log("");
    if (defaults.length > 0) {
      console.log("❌ Default privileges que re-otorgarían TRUNCATE a tablas futuras:");
      for (const d of defaults) console.log(`   · owner=${d.owner} grantee=${d.grantee} ${d.privilege_type}`);
    } else {
      console.log("✅ Los default privileges de public no conceden TRUNCATE a esos roles.");
    }
    console.log("");
    if (hard) {
      console.log("VEREDICTO: ❌ HARD — hay privilegios de TRUNCATE sobre roles expuestos.");
      console.log("           Aplicar drizzle/0042_revoke_truncate_authenticated.sql.");
    } else {
      console.log("VEREDICTO: ✅ sin privilegios peligrosos de TRUNCATE.");
    }
  }

  await client.end();
  process.exit(hard ? 1 : 0);
} catch (err) {
  console.error(`❌ Error consultando la base: ${err instanceof Error ? err.message : String(err)}`);
  try { await client.end(); } catch { /* ya cerrado */ }
  process.exit(2);
}
