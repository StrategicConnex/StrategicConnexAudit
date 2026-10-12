import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/shared/db/schemas";
import { withRLS } from "@/shared/db/rls";

/**
 * PRUEBA NEGATIVA DEL AGUJERO RLS (P0.2-C)
 *
 * Demuestra que la conexión cruda (rol postgres, BYPASSRLS) lee filas
 * de TODOS los tenants, y que withRLS restringe a un tenant específico.
 *
 * Se salta si no hay DIRECT_URL configurado (entornos sin base real).
 */
const directUrl = process.env.DIRECT_URL;

describe.skipIf(!directUrl)("RLS hole proof (negative test)", () => {
  const pool = new Pool({ connectionString: directUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const directDb = drizzle(pool, { schema });

  it("raw query sees ALL tenants", async () => {
    const rows = await pool.query<{ owner_id: string }>(`SELECT owner_id FROM projects LIMIT 200`);
    const owners = new Set(rows.rows.map(r => r.owner_id));
    expect(owners.size).toBeGreaterThan(1);
  });

  it("withRLS restricts to a single tenant", async () => {
    const first = await pool.query<{ owner_id: string }>(`SELECT DISTINCT owner_id FROM projects ORDER BY owner_id LIMIT 1`);
    const tenant = first.rows[0]?.owner_id;
    expect(tenant).toBeTruthy();

    const restricted = await withRLS(directDb, tenant, async db =>
      db.query.projects.findMany({ limit: 200, columns: { owner_id: true } })
    );
    const owners = new Set(restricted.map(r => r.owner_id));
    expect(owners.has(tenant)).toBe(true);
    expect(owners.size).toBeLessThanOrEqual(1);
  });

  afterAll(() => pool.end());
});
