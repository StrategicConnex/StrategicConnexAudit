/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Política de conexión TLS a Postgres para los scripts de BD.

   POR QUÉ EXISTE (bug real, reproducido el 2026-10-11 con pg@8.20.0):
   `pg/lib/connection-parameters.js:59-60` hace
   `config = Object.assign({}, config, parse(config.connectionString))`, es
   decir el `sslmode` de la URL se aplica DESPUÉS y PISA el objeto `ssl` que le
   pases al constructor. Y `pg-connection-string@2.12.0:77-79` convierte
   cualquier `sslmode=<algo>` en `config.ssl = {}`, que Node interpreta como
   `rejectUnauthorized: true`. Consecuencia doble:

     · `ssl: { rejectUnauthorized: false }` es CÓDIGO MUERTO si el DSN trae
       `sslmode` → contra el pooler de Supabase la conexión muere con
       «self-signed certificate in certificate chain»;
     · `ssl: { rejectUnauthorized: DB_ALLOW_INSECURE_SSL === "true" }` ADEMÁS
       INVIERTE el flag: con `DB_ALLOW_INSECURE_SSL=true` (el operador pide
       inseguro) acababa exigiendo verificación estricta.

   La política, escrita una sola vez para los tres consumidores
   (`drift-check.mjs`, `manual/backup-manager.ts` y `fake-data-audit.mjs`):

     1. se QUITA `sslmode` de la URL y el objeto `ssl` se decide nosotros, así
        no hay nada que pueda pisarlo;
     2. `sslmode=disable` → `ssl: false` (Postgres local sin TLS);
     3. cualquier otro caso → `ssl: { rejectUnauthorized: false }`: el pooler
        sirve una cadena que Node no trae en su almacén (misma política que
        `scripts/db/fake-data-audit.mjs`, el script que ya funcionaba).

   NO usar este helper donde la verificación estricta sea un requisito: para
   conexiones de aplicación se usa `DATABASE_SSL_MODE=verify-full` con la CA
   del proyecto, no esta política de scripts.
   ═══════════════════════════════════════════════════════════════════════ */

/** `sslmode` presente en la query del DSN (no en el usuario o el path). */
const SSLMODE = /[?&]sslmode=([^&]*)/i;

/**
 * Quita `sslmode` de la query del DSN conservando el resto de parámetros.
 * Se hace por split explícito (no con regex sobre el separador) para no dejar
 * `&`/`?` huérfanos cuando el parámetro es el primero o el último.
 *
 * @param {string} url
 * @returns {string}
 */
export function stripSslmode(url) {
  const queryAt = url.indexOf("?");
  if (queryAt === -1) return url;
  const head = url.slice(0, queryAt);
  const rest = url
    .slice(queryAt + 1)
    .split("&")
    .filter((param) => param && !/^sslmode=/i.test(param));
  return rest.length > 0 ? `${head}?${rest.join("&")}` : head;
}

/**
 * Config de conexión lista para `new pg.Pool(...)` / `new pg.Client(...)`.
 *
 * @param {string} url DSN de Postgres (puede traer `sslmode`).
 * @returns {{ connectionString: string, ssl: false | { rejectUnauthorized: false } }}
 */
export function connectionFor(url) {
  const connectionString = stripSslmode(url);
  const mode = url.match(SSLMODE)?.[1]?.toLowerCase();
  // Sólo `disable` desactiva el TLS de forma explícita (Postgres local).
  // `allow`/`prefer`/`require`/`verify-*` mantienen la política TLS de abajo.
  if (mode === "disable") return { connectionString, ssl: false };
  return { connectionString, ssl: { rejectUnauthorized: false } };
}
