#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — C7: inventario RLS (schema ↔ migraciones ↔ manifest).

   No necesita base de datos: deriva el estado de RLS de FUENTE DE VERDAD
   estática (el schema de Drizzle + las migraciones de `drizzle/`) y lo
   compara contra `scripts/db/rls-manifest.json`. FALLA (exit 1) si:

     ❌ HARD   una tabla con GRANT a `authenticated`/`anon` no tiene
               `ENABLE ROW LEVEL SECURITY` → exposición cross-tenant real.
     ❌ HARD   una tabla del manifest marcada `tenant` no tiene RLS o no
               tiene ninguna policy → el aislamiento dejó de estar cubierto.
     ❌ HARD   una tabla del schema no está clasificada en el manifest →
               obliga a decidir explícitamente al añadir una tabla nueva.
     ❌ HARD   el manifest referencia una tabla que ya no existe en el schema
               (entrada obsoleta que hay que retirar).

     ⚠️  SOFT  tabla con RLS y sin policy (fail-closed: nadie salvo el owner
               la lee). Se reporta, no falla.

   Uso:
     node scripts/db/rls-inventory.mjs            # informe + veredicto
     node scripts/db/rls-inventory.mjs --json     # salida JSON para CI
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");
const SCHEMA_DIR = path.join(ROOT, "src/shared/db/schemas");
const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
export const MANIFEST_PATH = path.join(__dirname, "rls-manifest.json");

const IDENT = "[a-z0-9_]+";
const IDENT_MATCH = /^[a-z0-9_]+$/;
const ROLES_EXPOSED = ["authenticated", "anon"];

/** Quita comentarios SQL para que las coincidencias no vengan de texto muerto. */
export function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** drizzle separa sentencias con `--> statement-breakpoint`. */
export function splitStatements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => stripSqlComments(s).trim())
    .filter(Boolean);
}

/** `"public"."projects"` / `public.projects` / `projects` → `projects`. */
export function normalizeIdent(raw) {
  const parts = String(raw)
    .trim()
    .split(".")
    .map((p) => p.trim().replace(/^"|"$/g, ""));
  return parts[parts.length - 1];
}

/**
 * Tablas declaradas con pgTable(...) en el schema de Drizzle, con el nombre SQL
 * de sus columnas. Las columnas hacen falta para saber si una policy creada por
 * SQL dinámico llegaría a crearse (0027 usa `project_id` en el USING).
 */
export function readSchema(schemaDir = SCHEMA_DIR) {
  const tables = new Map(); // tabla -> Set(nombres SQL de columna)
  for (const file of fs.readdirSync(schemaDir).filter((f) => f.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(schemaDir, file), "utf8");
    // Captura balanceada de pgTable("name", { ... }) contando llaves.
    const re = /pgTable\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const start = m.index + m[0].length;
      let depth = 1;
      let i = start;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
      }
      const body = src.slice(start, i - 1);
      const columns = new Set();
      for (const col of body.matchAll(/^[ \t]{2,}[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*[a-zA-Z_][a-zA-Z0-9_]*\(\s*["'`]([^"'`]+)["'`]/gm)) {
        columns.add(col[1]);
      }
      tables.set(m[1], columns);
    }
  }
  return tables;
}

/** Solo los nombres de las tablas del schema. */
export function readSchemaTables(schemaDir = SCHEMA_DIR) {
  return new Set(readSchema(schemaDir).keys());
}

/**
 * Estado derivado de las migraciones: por tabla, si tiene RLS y qué policies
 * y grants declara. Soporta el patrón dinámico de 0027
 * (`EXECUTE format('CREATE POLICY %I ON %I ...', t || '_fase2', t)`) donde el
 * nombre de tabla no aparece literal junto al CREATE POLICY.
 */
export function readMigrationState(schemaColumns = readSchema(), migrationsDir = MIGRATIONS_DIR) {
  const state = new Map(); // tabla -> { rls, policies:Set, grants:Set, notes:Set }
  const ensure = (t) => {
    if (!state.has(t)) state.set(t, { rls: false, policies: new Set(), grants: new Set(), notes: new Set() });
    return state.get(t);
  };

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    for (const stmt of splitStatements(fs.readFileSync(path.join(migrationsDir, file), "utf8"))) {
      for (const m of stmt.matchAll(
        new RegExp(`ALTER\\s+TABLE\\s+((?:public\\.)?"?${IDENT}"?)\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "gi"),
      )) {
        ensure(normalizeIdent(m[1])).rls = true;
      }

      for (const m of stmt.matchAll(
        new RegExp(`CREATE\\s+POLICY\\s+(?:"([^"]+)"|(${IDENT}))\\s+ON\\s+((?:public\\.)?"?${IDENT}"?)`, "gi"),
      )) {
        const name = m[1] || m[2];
        emitPolicy(ensure(normalizeIdent(m[3])), name);
      }

      // Policies creadas por SQL dinámico: el nombre lleva sufijo (p.ej. _fase2).
      if (/EXECUTE\s+format\(\s*'CREATE\s+POLICY\s+%I\s+ON\s+%I/i.test(stmt)) {
        const suffix = (stmt.match(/'CREATE\s+POLICY\s+%I\s+ON\s+%I[\s\S]{0,200}?\bt\s*\|\|\s*'([^']*)'/i) || [])[1];
        for (const arr of stmt.matchAll(/ARRAY\s*\[([\s\S]*?)\]/gi)) {
          for (const t of (arr[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1))) {
            if (!t) continue;
            const entry = ensure(t);
            // El USING referencia `project_id`; si la tabla no tiene esa
            // columna el CREATE POLICY falla y el `EXCEPTION WHEN OTHERS` del
            // bloque la descarta en silencio → la tabla queda fail-closed.
            if (schemaColumns.has(t) && !schemaColumns.get(t).has("project_id")) {
              entry.notes.add(`${file}: policy dinámica omitida (sin columna project_id → fail-closed)`);
              continue;
            }
            emitPolicy(entry, `${t}${suffix ?? "_dyn"} (dinámica)`);
          }
        }
      }

      for (const m of stmt.matchAll(
        new RegExp(`GRANT\\s+([\\s\\S]*?)\\s+ON\\s+([\\s\\S]*?)\\s+TO\\s+(${ROLES_EXPOSED.join("|")})\\b`, "gi"),
      )) {
        for (const raw of m[2].split(",")) {
          const t = normalizeIdent(raw);
          if (IDENT_MATCH.test(t)) ensure(t).grants.add(m[3].toLowerCase());
        }
      }
    }
  }
  return state;
}

function emitPolicy(entry, name) {
  // Se acumulan por nombre: las migraciones son idempotentes
  // (`DROP POLICY IF EXISTS` + `CREATE POLICY` con el mismo nombre).
  entry.policies.add(name);
}

/** Clasificación completa para reporte y verificación. */
export function buildInventory({ schemaDir = SCHEMA_DIR, migrationsDir = MIGRATIONS_DIR } = {}) {
  const schemaColumns = readSchema(schemaDir);
  const schema = new Set(schemaColumns.keys());
  const mig = readMigrationState(schemaColumns, migrationsDir);

  const rows = [...schema].sort().map((table) => {
    const entry = mig.get(table);
    return {
      table,
      rls: Boolean(entry?.rls),
      policies: entry ? [...entry.policies] : [],
      grants: entry ? [...entry.grants].sort() : [],
      notes: entry ? [...entry.notes] : [],
    };
  });

  const orphanRls = [...mig.keys()].filter((t) => !schema.has(t)).sort();
  return { rows, schema, orphanRls };
}

/**
 * Compara el inventario contra el manifest y devuelve los problemas.
 *
 * `hard` rompe el pipeline; `soft` solo se reporta.
 */
export function checkInventory(manifest = loadManifest(), dirs = {}) {
  const { rows, schema, orphanRls } = buildInventory(dirs);
  const hard = [];
  const soft = [];

  const tenant = new Set(manifest.tenant ?? []);
  const classified = new Set([
    ...tenant,
    ...Object.keys(manifest.publicCatalogs ?? {}),
    ...Object.keys(manifest.failClosed ?? {}),
  ]);
  const exceptions = new Set(Object.keys(manifest.rlsExceptions ?? {}));

  for (const row of rows) {
    // En `public` los roles `anon`/`authenticated` heredan privilegios por
    // defecto (Supabase): cualquier tabla sin RLS es legible cross-tenant. Por
    // eso el propio 0027/0038 razonan que TODA tabla de public debe llevar RLS.
    if (!row.rls && !exceptions.has(row.table)) {
      hard.push(`tabla "${row.table}" SIN RLS — toda tabla de public debe habilitarlo`);
    }
    const exposable = row.grants.some((g) => ROLES_EXPOSED.includes(g));
    if (exposable && !row.rls) {
      hard.push(`tabla "${row.table}" con GRANT a ${row.grants.join("/")} pero sin RLS — exposición cross-tenant`);
    }
    if (!classified.has(row.table) && !exceptions.has(row.table)) {
      hard.push(`tabla "${row.table}" no está clasificada en rls-manifest.json`);
    }
    if (tenant.has(row.table)) {
      if (!row.rls) hard.push(`tabla tenant "${row.table}" sin ENABLE ROW LEVEL SECURITY`);
      if (row.policies.length === 0) hard.push(`tabla tenant "${row.table}" sin ninguna policy`);
    }
    if (row.rls && row.policies.length === 0) {
      soft.push(`tabla "${row.table}" con RLS y sin policy (fail-closed)`);
    }
    for (const note of row.notes) soft.push(`tabla "${row.table}": ${note}`);
  }

  for (const t of classified) {
    if (!schema.has(t)) hard.push(`manifest obsoleto: "${t}" ya no existe en el schema`);
  }
  for (const t of exceptions) {
    if (!schema.has(t)) hard.push(`rlsExceptions obsoleto: "${t}" ya no existe en el schema`);
    else if (rows.find((r) => r.table === t)?.rls) {
      hard.push(`"${t}" está en rlsExceptions pero SÍ tiene RLS — retírala de la excepción`);
    }
  }
  for (const t of orphanRls) {
    soft.push(`migraciones declaran RLS/policies para "${t}", ausente del schema de Drizzle`);
  }

  return { rows, hard, soft, ok: hard.length === 0 };
}

export function loadManifest(file = MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// ── CLI ─────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && url.pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const AS_JSON = process.argv.includes("--json");
  const manifest = loadManifest();
  const { rows, hard, soft, ok } = checkInventory(manifest);

  if (AS_JSON) {
    console.log(JSON.stringify({ ok, hard, soft, rows }, null, 2));
  } else {
    console.log("\n═══ Inventario RLS (schema ↔ migraciones ↔ manifest) ═══\n");
    const tenant = new Set(manifest.tenant ?? []);
    const catalog = new Set(Object.keys(manifest.publicCatalogs ?? {}));
    const failClosed = new Set(Object.keys(manifest.failClosed ?? {}));
    const exceptions = new Set(Object.keys(manifest.rlsExceptions ?? {}));
    const kind = (t) =>
      tenant.has(t) ? "tenant" : catalog.has(t) ? "catálogo" : failClosed.has(t) ? "fail-closed" : exceptions.has(t) ? "excepción" : "SIN CLASIFICAR";
    for (const r of rows) {
      const pol = r.policies.length ? `${r.policies.length} policy` : "0 policy";
      console.log(
        `  ${r.rls ? "🔒" : "🚨"} ${r.table.padEnd(32)} ${kind(r.table).padEnd(13)} RLS=${r.rls ? "sí" : "NO"} · ${pol}${r.grants.length ? ` · grant:${r.grants.join("/")}` : ""}`,
      );
    }
    console.log(`\nTablas en schema: ${rows.length}`);
    if (soft.length) {
      console.log("\n⚠️  Avisos:");
      for (const s of soft) console.log(`  - ${s}`);
    }
    if (hard.length) {
      console.log("\n❌ Problemas duros:");
      for (const h of hard) console.log(`  - ${h}`);
      console.log(`\n🚨 Inventario RLS: ${hard.length} problema(s) duro(s).`);
    } else {
      console.log("\n✅ Inventario RLS sin problemas duros.");
    }
  }
  process.exit(ok ? 0 : 1);
}
