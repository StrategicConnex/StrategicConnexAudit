/**
 * distributed-cache.ts — Caché distribuida de resultados de tools (C2)
 *
 * Antes: `executionCache` en `src/server/intelligence/core/cache.ts` era un Map
 * por instancia — dos requests del mismo dominio en instancias serverless
 * distintas re-ejecutaban la herramienta y volvían a gastar cuota. Esta tabla
 * es el nivel L2 compartido, keyed por el mismo `cache_key` que ya anticipaba
 * `intelligence_tool_runs.cache_key` (`toolId::target` normalizado).
 *
 * Acceso: sólo el backend vía `directDb` (conexión de servicio, dueña de la
 * tabla). RLS habilitada SIN policies → anon/authenticated quedan denegados
 * por defecto (patrón de `rate_limit_windows`, ADR-002). El `key` es un
 * identificador de tool+target público (dominio/IP), no un dato de tenant, por
 * lo que la entrada puede compartirse entre proyectos.
 *
 * Fail-open: cualquier fallo del store se trata como miss (el tool se ejecuta
 * igual). La caché optimiza coste/latencia, nunca es una barrera de seguridad.
 */

import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const distributedCache = pgTable(
  "distributed_cache",
  {
    /** Clave `toolId::target` (misma que `intelligence_tool_runs.cache_key`). */
    key: text("key").primaryKey(),

    /** Resultado serializado de la ejecución de la herramienta. */
    value: jsonb("value").notNull(),

    /** Instante de vencimiento; base del sweep de filas expiradas. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_distributed_cache_expires_at").on(t.expiresAt)],
);
