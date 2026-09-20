#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Baseline del ledger de migraciones de Drizzle.

   Contexto: la BD de producción se migró a mano (scripts ad-hoc) ANTES de
   adoptar `drizzle-kit migrate`. Sin ledger, `migrate` intentaría re-aplicar
   todo el historial y moriría en el primer CREATE TABLE.

   Qué hace:
   1. Crea el schema `drizzle` y la tabla `drizzle.__drizzle_migrations`
      (id, hash, created_at) — la MISMA estructura que usa drizzle-orm.
   2. Lee drizzle/meta/_journal.json y por cada migración calcula
      hash = sha256(contenido del .sql) — idéntico a readMigrationFiles() —
      e inserta (hash, when) en el ledger.
   3. No toca ningún otro objeto de la BD: solo el ledger. Idempotente.

   NOTA: solo las migraciones NUMERADAS (0000–0032) están en el journal. Las
   fechadas (2026-08-*) nunca se generaron con drizzle-kit y sus tablas ya
   existen en la BD; un schema-push futuro las detectará si difieren.
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import url from "node:url";
import pg from "pg";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

// ── .env.local sin dependencias ─────────────────────────────────────────
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url_ = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").split("\\$").join("$");
if (!url_) {
  console.error("❌ DIRECT_URL/DATABASE_URL no definida (.env.local)");
  process.exit(1);
}

// Igual que drizzle-kit: sha256 del contenido EXACTO del archivo .sql.
const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle/meta/_journal.json"), "utf8"));
const migrations = journal.entries.map((e) => {
  const file = path.join(ROOT, "drizzle", `${e.tag}.sql`);
  const sql = fs.readFileSync(file, "utf8");
  return { tag: e.tag, when: e.when, hash: crypto.createHash("sha256").update(sql).digest("hex") };
});

const client = new pg.Client({
  connectionString: url_,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  await client.query("BEGIN");

  await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  // Idempotencia: no duplicar hashes ya presentes.
  const existing = new Set((await client.query(`SELECT hash FROM drizzle.__drizzle_migrations`)).rows.map((r) => r.hash));

  let inserted = 0;
  for (const m of migrations) {
    if (existing.has(m.hash)) continue;
    await client.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [m.hash, m.when]);
    inserted++;
  }

  await client.query("COMMIT");

  const total = (await client.query(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0].n;
  console.log(`✅ Ledger listo: ${inserted} filas insertadas, ${total} totales (${migrations.length} migraciones en journal).`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("❌ Error creando el ledger:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
