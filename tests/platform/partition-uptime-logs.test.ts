// tests/platform/partition-uptime-logs.test.ts
// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { splitStatements } from "../../scripts/db/rls-inventory.mjs";

let pglite: PGlite;
let d: ReturnType<typeof drizzle>;

const MIGRATION = readFileSync(
  join(process.cwd(), "drizzle/2026-10-21_partition_uptime_logs.sql"),
  "utf8",
);

beforeAll(async () => {
  pglite = new PGlite();
  d = drizzle(pglite);

  // Dependencia mínima: tabla projects (la migración crea FK hacia ella).
  await d.execute(sql`
    CREATE TABLE projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT
    );
  `);

  // Legacy mínima con policy + grant para probar la COPIA de RLS/grants.
  await d.execute(sql`
    CREATE TABLE uptime_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
      is_up BOOLEAN NOT NULL,
      status_code INTEGER,
      response_time_ms INTEGER,
      error_message TEXT,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`ALTER TABLE uptime_logs ENABLE ROW LEVEL SECURITY;`);
  await d.execute(sql`
    CREATE POLICY uptime_system ON uptime_logs
      FOR ALL USING (checked_at IS NOT NULL) WITH CHECK (true);
  `);
  // El rol de test debe existir para que el GRANT del DO block funcione.
  await d.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
        CREATE ROLE anonymous NOLOGIN;
      END IF;
    END $$;
  `);
  await d.execute(sql`GRANT SELECT ON uptime_logs TO "anonymous";`);

  // Fixture de copia (Desviación D5): 1 fila legacy en octubre 2026 para
  // evidenciar el INSERT…SELECT con un conteo no vacío.
  const legacyProject = (await d.execute(
    sql`INSERT INTO projects (name) VALUES ('legacy') RETURNING id`,
  )) as unknown as { rows: Array<{ id: string }> };
  await d.execute(sql`
    INSERT INTO uptime_logs (project_id, is_up, checked_at)
    VALUES (${legacyProject.rows[0]!.id}, true, '2026-10-05T12:00:00Z');
  `);

  // Aplicar la migración statement a statement (helper del guard RLS).
  for (const s of splitStatements(MIGRATION).filter((s: string) => s.trim().length > 0)) {
    await d.execute(sql.raw(s));
  }
});

describe("particionado de uptime_logs (Q4 6.1)", () => {
  it("la tabla es particionada RANGE(checked_at) con PK compuesta", async () => {
    const res = (await d.execute(
      sql`SELECT partstrat FROM pg_partitioned_table p
          JOIN pg_class c ON c.oid = p.partrelid WHERE c.relname = 'uptime_logs'`,
    )) as unknown as { rows: Array<{ partstrat: string }> };
    expect(res.rows[0]?.partstrat).toBe("r");

    const pk = (await d.execute(
      sql`SELECT COUNT(*)::int AS n FROM pg_constraint
          WHERE conrelid = 'uptime_logs'::regclass AND contype = 'p'`,
    )) as unknown as { rows: Array<{ n: number }> };
    expect(pk.rows[0]?.n).toBe(1); // PK compuesta (id, checked_at)

    // Las 6 particiones pre-creadas con sus rangos (sep-2026 → feb-2027).
    const parts = (await d.execute(
      sql`SELECT c.relname FROM pg_inherits i
          JOIN pg_class c ON c.oid = i.inhrelid
          WHERE i.inhparent = 'uptime_logs'::regclass ORDER BY c.relname`,
    )) as unknown as { rows: Array<{ relname: string }> };
    expect(parts.rows.map((r) => r.relname)).toEqual([
      "uptime_logs_2026_09",
      "uptime_logs_2026_10",
      "uptime_logs_2026_11",
      "uptime_logs_2026_12",
      "uptime_logs_2027_01",
      "uptime_logs_2027_02",
    ]);
  });

  it("sin triggers + fail-closed: insert fuera del rango pre-creado falla (23514) — decisión owner 2026-10-20", async () => {
    // Decisión owner (checkpoint C1): NO existe ningún trigger en
    // uptime_logs (retirado de todo lo tocado por la Task 5).
    const trig = (await d.execute(
      sql`SELECT tgname FROM pg_trigger WHERE tgrelid = 'uptime_logs'::regclass AND NOT tgisinternal`,
    )) as unknown as { rows: Array<{ tgname: string }> };
    expect(trig.rows).toEqual([]);

    // Realidad PG16 (probe adjunto a la desviación): el routing ocurre ANTES
    // del BEFORE INSERT del parent ⇒ sin fallback al vuelo; el insert fuera
    // de rango FALLA CERRADO (23514) — nunca pérdida silenciosa.
    const { rows } = (await d.execute(
      sql`INSERT INTO projects (name) VALUES ('p') RETURNING id`,
    )) as unknown as { rows: Array<{ id: string }> };
    let caught: unknown;
    try {
      await d.execute(
        sql`INSERT INTO uptime_logs (project_id, is_up, checked_at)
            VALUES (${rows[0]!.id}, true, '2027-09-15T00:00:00Z')`,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const chain: string[] = [];
    let cur: unknown = caught;
    while (cur instanceof Error) {
      chain.push(cur.message);
      cur = (cur as unknown as { cause?: unknown }).cause;
    }
    expect(chain.join(" | ")).toMatch(/no partition of relation|23514/);
  });

  it("policies y grants copiados del legacy: la tabla sigue protegida", async () => {
    const policies = (await d.execute(
      sql`SELECT policyname FROM pg_policies WHERE tablename = 'uptime_logs'`,
    )) as unknown as { rows: Array<{ policyname: string }> };
    expect(policies.rows.map((r) => r.policyname)).toContain("uptime_system");

    const relisrls = (await d.execute(
      sql`SELECT relrowsecurity FROM pg_class WHERE relname = 'uptime_logs'`,
    )) as unknown as { rows: Array<{ relrowsecurity: boolean }> };
    expect(relisrls.rows[0]?.relrowsecurity).toBe(true);
  });

  it("los inserts caen en la partición del mes correspondiente", async () => {
    const { rows: pj } = (await d.execute(
      sql`INSERT INTO projects (name) VALUES ('p2') RETURNING id`,
    )) as unknown as { rows: Array<{ id: string }> };
    await d.execute(
      sql`INSERT INTO uptime_logs (project_id, is_up, checked_at)
          VALUES (${pj[0]!.id}, true, '2026-11-10T12:00:00Z')`,
    );
    const inPart = (await d.execute(
      sql`SELECT COUNT(*)::int AS n FROM uptime_logs_2026_11`,
    )) as unknown as { rows: Array<{ n: number }> };
    expect(inPart.rows[0]?.n).toBe(1);
  });

  it("la copia INSERT…SELECT transporta las filas del legacy (Desviación D5: conteo evidenciado)", async () => {
    const copied = (await d.execute(
      sql`SELECT COUNT(*)::int AS n FROM uptime_logs_2026_10 WHERE checked_at = '2026-10-05T12:00:00Z'`,
    )) as unknown as { rows: Array<{ n: number }> };
    expect(copied.rows[0]?.n).toBe(1);
  });
});
