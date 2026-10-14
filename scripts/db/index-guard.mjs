#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Guard anti-regresión de índices declarados vs base de datos.

   PROBLEMA QUE CIERRA (P1-10, 2026-10-14): `scripts/db/drift-check.mjs` compara
   tablas, columnas, nullability y defaults, pero NO índices. Gracias a ese hueco
   ciego, 32 índices declarados con `CREATE INDEX IF NOT EXISTS` en las
   migraciones `0012`/`0015`/`0019` no existían en producción mientras
   `drizzle.__drizzle_migrations` los contaba como aplicados (61/61). El efecto
   medido: 42 columnas FK sin índice cubridor, `uptime_logs` leyendo la tabla
   completa (586 buffers) para devolver 10 filas, y ningún gate en rojo.

   ESTRATEGIA: la relación migraciones → BD es DURA. Todo índice que una
   migración declara tiene que existir; si falta, es regresión (exit 1). El
   sentido inverso (índice presente que ninguna migración declara) se reporta
   como aviso y NO falla: es el patrón preexistente del repo (índices creados a
   mano o declarados sólo en el schema Drizzle) y bloquear por él convertiría el
   guard en un falso positivo permanente.

   Uso normal (gate, requiere DIRECT_URL o DATABASE_URL):
     node scripts/db/index-guard.mjs
   Diagnosticar sin fallar:
     node scripts/db/index-guard.mjs --print-report

   Exit codes: 0 alineado · 1 índice declarado ausente en BD · 2 no se pudo
   verificar (sin credenciales, sin conexión o sin migraciones legibles). Un
   guard que devolviera 0 al no poder verificar sería peor que ninguno.

   SOLO LECTURA: consulta `pg_indexes` y jamás crea, borra ni repara índices —
   el arreglo vive en una migración revisada.
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import pg from "pg";
import { connectionFor } from "../lib/db-connection.mjs";
import { collectDeclaredIndexes, compareIndexes, formatMissingIndex } from "./index-patterns.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
const MIGRATIONS_SOURCE = migrationsDirFromArgs(process.argv, MIGRATIONS_DIR);

const PRINT_REPORT = process.argv.includes("--print-report") || process.argv.includes("--pr");

/**
 * Permite apuntar a otro directorio de migraciones. Existe como seam de test
 * (los casos de regresión necesitan un `CREATE INDEX` declarado que la base no
 * tiene); su valor por defecto es el `drizzle/` del repo.
 */
function migrationsDirFromArgs(argv, fallback) {
  const direct = argv.find((a) => a.startsWith("--migrations-dir="));
  if (direct) return path.resolve(direct.slice("--migrations-dir=".length));
  const idx = argv.indexOf("--migrations-dir");
  if (idx !== -1 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  return fallback;
}

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
  console.error("❌ index-guard: DIRECT_URL/DATABASE_URL no definida — no se puede verificar.");
  process.exit(2);
}

/* ── migraciones (orden cronológico = orden de lectura) ────────────────── */
let declared;
try {
  const files = fs
    .readdirSync(MIGRATIONS_SOURCE)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, sql: fs.readFileSync(path.join(MIGRATIONS_SOURCE, f), "utf8") }));
  if (files.length === 0) {
    console.error(`❌ index-guard: no se encontró ninguna migración en ${MIGRATIONS_SOURCE} — no se puede verificar.`);
    process.exit(2);
  }
  declared = collectDeclaredIndexes(files);
} catch (error) {
  console.error("❌ index-guard: no se pudieron leer las migraciones —", error.message);
  process.exit(2);
}

/* ── medición (solo lectura) ───────────────────────────────────────────── */
async function measureIndexNames() {
  const client = new pg.Client(connectionFor(dbUrl));
  await client.connect();
  try {
    // Sólo índices NO primarios: el de la PK lo crea Postgres con la tabla y
    // ninguna migración lo declara, así que contarlo inflaría el aviso de
    // «presentes sin declarar» con los ~79 `*_pkey` de `public`.
    const { rows } = await client.query(
      `select i.indexrelid::regclass::text as indexname
         from pg_index i
         join pg_class c on c.oid = i.indrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not i.indisprimary
        order by 1`,
    );
    return new Set(rows.map((r) => r.indexname));
  } finally {
    await client.end();
  }
}

let present;
try {
  present = await measureIndexNames();
} catch (error) {
  console.error("❌ index-guard: no se pudo consultar la base —", error.message);
  process.exit(2);
}

/* ── comparación ───────────────────────────────────────────────────────── */
const { missing, extra } = compareIndexes(declared, present);

if (PRINT_REPORT) {
  console.log(
    JSON.stringify(
      {
        declaredIndexes: declared.length,
        indexesInDb: present.size,
        missing: missing.map((m) => m.name),
        extra: extra.map((e) => e.name),
      },
      null,
      2,
    ),
  );
  process.exit(missing.length > 0 ? 1 : 0);
}

if (missing.length > 0) {
  console.error("❌ index-guard: hay índices declarados en las migraciones que NO existen en la base\n");
  for (const m of missing) console.error(`   - ${formatMissingIndex(m)}`);
  console.error(
    "\n💡 Que el ledger diga «aplicado» no prueba que el DDL corrió: `drizzle.__drizzle_migrations` " +
      "sólo registra la migración, no verifica su efecto. Crea una migración con los " +
      "`CREATE INDEX IF NOT EXISTS` que faltan (mismo nombre y definición que el original) y " +
      "aplícala con `pnpm db:migrate`.",
  );
  process.exit(1);
}

console.log("✅ index-guard: OK — todo índice declarado en las migraciones existe en la base");
console.log(
  `   índices declarados: ${declared.length} · en la base (public): ${present.size} · sin declarar (aviso): ${extra.length}`,
);
if (extra.length > 0) {
  console.log(
    "   ⚠️  Presentes sin declaración en migraciones (no falla — patrón preexistente; revisa que no sean " +
      `${extra.length > 5 ? `${extra.length} en total: ` : ""}${extra.slice(0, 5).map((e) => e.name).join(", ")}${extra.length > 5 ? ", …" : ""})`,
  );
}
process.exit(0);
