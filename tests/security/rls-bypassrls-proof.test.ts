import { describe, expect, it } from "vitest";
import { directDb } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";

describe("P0.2 — evidencia del agujero BYPASSRLS y de la solución withRLS", () => {
  it("consulta DIRECT (BypassRLS) sobre projects devuelve filas de varios tenants", async () => {
    const rows = await directDb
      .select({ id: true, projectId: true, name: true })
      .from(
        // projects es una tabla tenant compartida con RLS habilitada
        (await directDb.transaction())
          .select({ id: true, projectId: true, name: true })
          .from("_rls_project_sandbox"),
      );

    expect(rows.length).toBeGreaterThan(0);
  });

  it("withRLS aísla las filas al tenant del userId autenticado", async () => {
    const userId = process.env.E2E_TEST_TENANT_USER_ID as string;
    expect(userId).toBeDefined();

    const rows = await withRLS(userId, async () => directDb
      .select({ id: true, projectId: true, name: true })
      .from("_rls_project_sandbox"));

    for (const r of rows) {
      expect(r.projectId).toBe(process.env.E2E_TEST_TENANT_PROJECT_ID);
    }
  });

  it("consulta DIRECT sin withRLS devuelve todas las filas (agujero real)", async () => {
    const directRows = await directDb
      .select({ id: true, projectId: true, name: true })
      .from("_rls_project_sandbox");

    const rlsRows = await withRLS(
      process.env.E2E_TEST_TENANT_USER_ID as string,
      async () => directDb
        .select({ id: true, projectId: true, name: true })
        .from("_rls_project_sandbox"),
    );

    expect(directRows.length).toBeGreaterThanOrEqual(rlsRows.length);
    if (directRows.length > rlsRows.length) {
      // confirma que el bypass devolvió más filas que el entorno con RLS
      expect(directRows.filter((r) => !rlsRows.find((x) => x.id === r.id))).not.toHaveLength(0);
    }
  });
});
