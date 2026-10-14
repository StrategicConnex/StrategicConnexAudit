import { describe, expect, it } from "vitest";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { directDb } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";

/**
 * P0.2 — evidencia del agujero BYPASSRLS y de la solución withRLS.
 *
 * REQUISITOS (P1-8): corre contra Postgres REAL con los fixtures de
 * tests/integration/setup.ts (dos tenants sembrados en `_rls_project_sandbox`,
 * RLS habilitado con policy por tenant). Se ejecuta con
 * `pnpm test:integration` (vitest.integration.config.ts); está excluido de la
 * suite unitaria porque sin BD este archivo solo puede fallar con
 * ECONNREFUSED — el fallo ambiental que arrastraba desde P0.2.
 *
 * NOTA DE CORRECCIÓN (2026-10-14): las consultas originales nunca llegaron a
 * ejecutarse contra ninguna BD — `.from("_rls_project_sandbox")` con un string
 * crudo drizzle lo parametriza como `from $1` (relación "$1" no existe) y
 * `(await directDb.transaction())` sin callback lanza TypeError. Se definicieron
 * las tablas con drizzle pgTable real; las aserciones y la intención son las
 * mismas.
 */

/** Table-sandbox con RLS creada por tests/integration/setup.ts. */
const rlsProjectSandbox = pgTable("_rls_project_sandbox", {
  id: uuid("id").primaryKey(),
  projectId: uuid("projectId").notNull(),
  name: text("name").notNull(),
  userId: uuid("user_id").notNull(),
});

describe("P0.2 — evidencia del agujero BYPASSRLS y de la solución withRLS", () => {
  it("consulta DIRECT (BypassRLS) sobre projects devuelve filas de varios tenants", async () => {
    const rows = await directDb
      .select({ id: true, projectId: true, name: true })
      .from(rlsProjectSandbox);

    expect(rows.length).toBeGreaterThan(0);
    // La esencia del «agujero»: la conexión de servicio ve los tenants A y B.
    const tenants = new Set(rows.map((r) => r.projectId));
    expect(tenants.size).toBeGreaterThanOrEqual(2);
  });

  it("withRLS aísla las filas al tenant del userId autenticado", async () => {
    const userId = process.env.E2E_TEST_TENANT_USER_ID as string;
    expect(userId).toBeDefined();

    const rows = await withRLS(userId, (tx) =>
      tx.select({ id: true, projectId: true, name: true }).from(rlsProjectSandbox),
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.projectId).toBe(process.env.E2E_TEST_TENANT_PROJECT_ID);
    }
  });

  it("consulta DIRECT sin withRLS devuelve todas las filas (agujero real)", async () => {
    const directRows = await directDb
      .select({ id: true, projectId: true, name: true })
      .from(rlsProjectSandbox);

    const rlsRows = await withRLS(
      process.env.E2E_TEST_TENANT_USER_ID as string,
      (tx) =>
        tx
          .select({ id: true, projectId: true, name: true })
          .from(rlsProjectSandbox),
    );

    expect(directRows.length).toBeGreaterThanOrEqual(rlsRows.length);
    if (directRows.length > rlsRows.length) {
      // confirma que el bypass devolvió más filas que el entorno con RLS
      expect(directRows.filter((r) => !rlsRows.find((x) => x.id === r.id))).not.toHaveLength(0);
    }
  });
});
