/**
 * index-patterns.mjs — lógica pura del guard de índices.
 *
 * POR QUÉ EXISTE: `scripts/db/drift-check.mjs` compara tablas, columnas,
 * nullability y defaults, pero **no índices**. En octubre de 2026 eso dejó pasar
 * una brecha real: 32 índices declarados con `CREATE INDEX IF NOT EXISTS` en
 * `0012`/`0015`/`0019` NO existían en la base de producción mientras
 * `drizzle.__drizzle_migrations` los daba por aplicados (61/61). El resultado
 * fueron 42 columnas FK sin índice cubridor y seq scans de hasta 586 buffers en
 * rutas calientes (`uptime_logs`), detectados a mano y no por el pipeline.
 *
 * ALCANCE DEL GUARD: la relación **migraciones → BD**. Todo índice que alguna
 * migración declara debe existir en `public`; si falta, es una regresión con
 * dientes (exit 1). El sentido inverso (índices presentes que ninguna migración
 * declara) NO falla: es el patrón preexistente del repo —índices creados a mano
 * o declarados sólo en el schema Drizzle— y se reporta como aviso para que la
 * decisión sea consciente.
 *
 * Lo que este módulo NO cubre todavía (siguiente paso, no un olvido): la
 * paridad schema Drizzle ↔ BD. Aquí se compara contra las migraciones, que son
 * el artefacto que realmente construye la base.
 */

/** Comentarios de línea (`--`) y de bloque — se quitan antes de buscar DDL para
 *  no confundir una mención en un comentario con un statement (caso real: el
 *  comentario «Idempotente: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT
 *  EXISTS» de `0037`, y el bloque de notas de `2026-09-24`). */
function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n\r]*/g, " ");
}

/** `CREATE [UNIQUE] INDEX [IF NOT EXISTS] [schema.]"nombre"` */
const CREATE_INDEX_RE =
  /create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(?:[a-z_][a-z0-9_]*\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?/gi;

/** `ON [schema.]"tabla" [USING btree] (columnas)` */
const ON_TABLE_RE = /\bon\s+(?:[a-z_][a-z0-9_]*\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?\s*(?:using\s+[a-z0-9_]+\s*)?\(([^)]*)\)/i;

/**
 * Extrae los índices declarados en un SQL de migración.
 *
 * Devuelve `{ name, unique, file, table, columns }`, en el orden del archivo.
 * El primer statement gana si un nombre se repite en el mismo archivo (una
 * migración idempotente puede re-declararlo sin cambiar la definición).
 *
 * @param {string} sql
 * @param {string} [file] etiqueta para el reporte (nombre del archivo)
 * @returns {{ name: string, unique: boolean, file: string, table: string | null, columns: string | null }[]}
 */
export function extractIndexDeclarations(sql, file = "") {
  const clean = stripSqlComments(String(sql ?? ""));
  const out = [];
  const seen = new Set();
  let match;
  CREATE_INDEX_RE.lastIndex = 0;
  while ((match = CREATE_INDEX_RE.exec(clean)) !== null) {
    const name = match[2];
    if (seen.has(name)) continue;
    seen.add(name);
    const rest = clean.slice(match.index, match.index + 600);
    const target = rest.match(ON_TABLE_RE);
    out.push({
      name,
      unique: Boolean(match[1]),
      file,
      table: target ? target[1] : null,
      // Sin comillas de identificador y con espacios colapsados: el texto se usa
      // para mensajes de error, no para reconstruir DDL.
      columns: target ? target[2].replace(/["`]/g, "").replace(/\s+/g, " ").trim() : null,
    });
  }
  return out;
}

/**
 * Une las declaraciones de todos los archivos de migración, quedándose con la
 * primera aparición de cada nombre (el orden de `files` decide: el llamador pasa
 * los archivos en orden cronológico).
 *
 * @param {{ file: string, sql: string }[]} files
 */
export function collectDeclaredIndexes(files) {
  const byName = new Map();
  for (const { file, sql } of files) {
    for (const decl of extractIndexDeclarations(sql, file)) {
      if (!byName.has(decl.name)) byName.set(decl.name, decl);
    }
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Compara lo declarado con lo medido en la base.
 *
 * `declared`: salida de `collectDeclaredIndexes` (o cualquier lista de
 * `{ name, ... }`). `present`: nombres existentes en la base.
 * Devuelve `{ missing, extra }` (ambos ordenados por nombre): `missing` es la
 * regresión que hace fallar el guard; `extra` es informativo.
 *
 * @param {{ name: string }[]} declared
 * @param {Iterable<string>} present
 */
export function compareIndexes(declared, present) {
  const presentSet = present instanceof Set ? present : new Set(present);
  const declaredNames = new Set(declared.map((d) => d.name));

  const missing = declared
    .filter((d) => !presentSet.has(d.name))
    .map((d) => ({ name: d.name, file: d.file, table: d.table, columns: d.columns, unique: d.unique }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const extra = [...presentSet]
    .filter((name) => !declaredNames.has(name))
    .sort()
    .map((name) => ({ name }));

  return { missing, extra };
}

/** Formatea un índice ausente para el reporte del gate. */
export function formatMissingIndex(d) {
  const destino = d.table ? `ON ${d.table} (${d.columns ?? "?"})` : "(destino no parseado)";
  const tipo = d.unique ? "UNIQUE INDEX" : "INDEX";
  return `AUSENTE EN BD: ${d.name} [${tipo} ${destino}] — declarado en ${d.file || "?"}`;
}
