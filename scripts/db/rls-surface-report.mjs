#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Superficie de acceso a datos NO protegida por RLS (P0.2).

   POR QUÉ EXISTE (medido el 2026-10-12): la aplicación se conecta como el rol
   `postgres`, que en esta base tiene `rolbypassrls = true`
   (`select current_user, (select rolbypassrls from pg_roles where rolname =
   current_user)` → `postgres | true`). Y `directDb` usa el mismo proyecto/rol
   por `DIRECT_URL`. Consecuencia: **ninguna** query queda protegida por RLS,
   ni con `db` ni con `directDb`; la única puerta que aplica políticas es
   `withRLS()` (`SET LOCAL ROLE authenticated` + `request.jwt.claims`).

   Eso reencuadra P0.2: el problema no es «quién usa directDb» sino «cuántos
   sitios consultan datos de tenant fuera de `withRLS`». Este script los cuenta
   y los clasifica por zona del árbol, para que el diseño y la allowlist del
   guard se apoyen en cifras reproducibles y no en una estimación de memoria.

   Importante — alcance del conteo: es un análisis LÉXICO (regex sobre el
   código, sin ejecutarlo). Cuenta LLAMADAS de acceso (`directDb.query|insert|
   update|delete|select|execute|transaction|$count` y lo mismo en `db.` sin
   envolver), no líneas ni imports. Un sitio contado aquí NO es
   necesariamente un fallo: puede estar protegido a mano con
   `assertProjectAccess`/`getProjectRole` o ser un camino interno legítimo
   (worker, logger, rate limit). El script no juzga: mide y agrupa.

   Uso:
     node scripts/db/rls-surface-report.mjs            # informe legible
     node scripts/db/rls-surface-report.mjs --json      # JSON para el guard/CI
     node scripts/db/rls-surface-report.mjs --por-clase # resumen por zona

   Exit code: 0 siempre — es un informe, no un gate (el gate es el guard de
   P0.2, que consumirá este mismo conteo contra su allowlist).
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");
const AS_JSON = process.argv.includes("--json");

/** Zonas del árbol y su significado para RLS. El orden importa: el primero gana. */
const ZONAS = [
  ["src/app/api/public", "API pública (token de API, sin sesión)"],
  ["src/app/api/cron", "infra (cron HTTP con secreto)"],
  ["src/app/api", "usuario (route handler con sesión)"],
  ["src/app/actions", "usuario (server action)"],
  ["src/app/admin", "admin/interno"],
  ["src/app/p/", "usuario (portal por token)"],
  ["src/app/", "usuario (UI / páginas)"],
  ["src/trigger", "worker interno (Trigger.dev, sin sesión)"],
  ["src/server/intelligence", "servicio (lo usan rutas y workers)"],
  ["src/server/lib", "servicio (lo usan rutas y workers)"],
  ["src/server/ai", "servicio (lo usan rutas y workers)"],
  ["src/server/api", "servicio (API pública)"],
  ["src/server/", "interno (seguridad, webhooks, reportes, observabilidad)"],
  ["src/shared/lib", "helper compartido"],
  ["src/shared/db", "infra (el propio withRLS)"],
];

const zona = (rel) => ZONAS.find(([p]) => rel.startsWith(p))?.[1] ?? "otro";

/** `directDb.<método>(` — no coincide con `otroDirectDb.` por el lookbehind. */
const RE_DIRECT = /(?<![\w.])directDb\.(query|insert|update|delete|select|execute|transaction|\$count)/g;
/** `db.<método>(` crudo, excluyendo `directDb.` y `lazyDb.`/`getDb.` */
const RE_BARE = /(?<![\w.$])db\.(query|insert|update|delete|select|execute|transaction)/g;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walk(abs);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      yield { abs, rel };
    }
  }
}

const lineOf = (src, index) => src.slice(0, index).split(/\r?\n/).length;

const archivos = [];
for (const { abs, rel } of walk(SRC)) {
  const src = fs.readFileSync(abs, "utf8");
  const directas = [...src.matchAll(RE_DIRECT)].map((m) => lineOf(src, m.index));
  const crudas = [...src.matchAll(RE_BARE)].map((m) => lineOf(src, m.index));
  if (directas.length === 0 && crudas.length === 0) continue;
  archivos.push({
    archivo: rel,
    zona: zona(rel),
    directDb: directas,
    dbSinEnvolver: crudas,
    usaWithRLS: /\bwithRLS\b/.test(src),
  });
}

const totales = archivos.reduce(
  (acc, a) => ({ directDb: acc.directDb + a.directDb.length, dbSinEnvolver: acc.dbSinEnvolver + a.dbSinEnvolver.length }),
  { directDb: 0, dbSinEnvolver: 0 },
);

/** Resumen agrupado por zona, con el solapamiento (withRLS + acceso crudo). */
function porZona() {
  const acc = new Map();
  for (const a of archivos) {
    const z = acc.get(a.zona) ?? { zona: a.zona, archivos: 0, directDb: 0, dbSinEnvolver: 0, conWithRLS: 0, mixtos: [], sitios: [] };
    z.archivos++;
    z.directDb += a.directDb.length;
    z.dbSinEnvolver += a.dbSinEnvolver.length;
    if (a.usaWithRLS) z.conWithRLS++;
    if (a.usaWithRLS && (a.directDb.length > 0 || a.dbSinEnvolver.length > 0)) z.mixtos.push(a.archivo);
    if (a.directDb.length > 0) z.sitios.push({ archivo: a.archivo, lineas: a.directDb });
    acc.set(a.zona, z);
  }
  return [...acc.values()].sort((a, b) => b.directDb + b.dbSinEnvolver - (a.directDb + a.dbSinEnvolver));
}

const zonaRows = porZona();
const userFacing = archivos
  .filter((a) => /^src\/app\/(api|actions|p\/|admin)/.test(a.archivo))
  .sort((a, b) => b.directDb.length + b.dbSinEnvolver.length - (a.directDb.length + a.dbSinEnvolver.length));

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        archivos: archivos.length,
        totales,
        porZona: zonaRows.map((z) => ({ ...z, mixtos: z.mixtos.length })),
        userFacing: userFacing.map((a) => ({
          archivo: a.archivo,
          zona: a.zona,
          directDb: a.directDb.length,
          dbSinEnvolver: a.dbSinEnvolver.length,
          usaWithRLS: a.usaWithRLS,
          lineas: a.directDb,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log("🔓 SCAUDIT — superficie de acceso a datos fuera de withRLS (P0.2)\n");
console.log(`   archivos con acceso a datos : ${archivos.length}`);
console.log(`   llamadas directDb.*         : ${totales.directDb}`);
console.log(`   llamadas db.* sin envolver  : ${totales.dbSinEnvolver}`);
console.log(`   TOTAL a auditar             : ${totales.directDb +totales.dbSinEnvolver}\n`);

console.log("   zona                                                             archivos  directDb  db crudo  con withRLS");
for (const z of zonaRows) {
  console.log(
    `   ${z.zona.padEnd(62)} ${String(z.archivos).padStart(8)} ${String(z.directDb).padStart(9)} ${String(z.dbSinEnvolver).padStart(9)} ${String(z.conWithRLS).padStart(11)}`,
  );
}

const mixtos = zonaRows.filter((z) => z.mixtos.length > 0);
if (mixtos.length > 0) {
  console.log("\n⚠️  ARCHIVOS QUE USAN withRLS **Y** ACCESO CRUDO (revisar uno a uno — mezclar los dos");
  console.log("    patrones en el mismo archivo es donde un camino nuevo se cuela sin política):");
  for (const z of mixtos) for (const f of z.mixtos) console.log(`   - ${f}`);
}

console.log("\n📄 CARA AL USUARIO (app/api, app/actions, app/p, app/admin) — orden por riesgo:");
for (const a of userFacing) {
  const detalle = a.directDb.length > 0 ? `  [directDb en ${a.directDb.join(", ")}]` : "";
  console.log(
    `   ${a.usaWithRLS ? " " : "!"} ${a.archivo}  →  directDb:${a.directDb.length} db:${a.dbSinEnvolver.length}${detalle}`,
  );
}
console.log("\n   (! = no usa withRLS en absoluto)");
console.log("\nEste informe no juzga: mide. La decisión por sitio va en el diseño de P0.2 y en la allowlist del guard.");
