import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "./schemas";

/**
 * executor.ts — El manejador de BD que un servicio puede recibir (patrón P0.2).
 *
 * POR QUÉ EXISTE: `db` (pooler) y `directDb` (conexión de servicio) se conectan
 * con el rol `postgres` de esta base, que tiene `rolbypassrls = true`. Es decir:
 * ninguna query queda protegida por RLS salvo que corra dentro de `withRLS()`
 * (`SET LOCAL ROLE authenticated` + `request.jwt.claims`). Un servicio que
 * importa `directDb`/`db` directamente elige —sin que se vea en su firma— leer
 * datos de tenant sin política.
 *
 * El patrón: el servicio NO importa la base; recibe este tipo como primer
 * parámetro. El llamante decide la autoridad:
 *   - route handler / server action con sesión → `withRLS(userId, (tx) => servicio(tx, …))`
 *   - worker de Trigger.dev / cron / job sin sesión → `servicio(directDb, …)`
 * (decisión explícita en el call site, auditable con `grep`).
 *
 * El tipo es la clase base común de `NodePgDatabase` (el `db`/`directDb` raíz) y
 * de `PgTransaction` (lo que entrega `withRLS`): ambos son `PgDatabase`, así que
 * el servicio compila igual con uno u otro y no hay que castear en cada llamada.
 */
export type DbExecutor = PgDatabase<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
