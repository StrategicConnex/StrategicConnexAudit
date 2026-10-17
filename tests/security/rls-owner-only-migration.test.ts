// @vitest-environment node
/**
 * 0052 (P2-16) — la migración que elimina `project_members`, aplicada entera.
 *
 * POR QUÉ EXISTE: los demás tests RLS usan la *última* definición de cada
 * policy (`effectivePolicyDdl`), así que nunca ejecutan el cuerpo de 0052. Y el
 * riesgo real de esta migración no está en el DROP, sino en lo que el DROP se
 * lleva por delante: 21 policies de 0016/0017/0022/0023/0024 hacen subquery
 * contra `project_members`, y `DROP TABLE … CASCADE` las borra en silencio,
 * dejando sus tablas con RLS activa y **sin ninguna policy** (fail-closed:
 * sólo los roles con BYPASSRLS podrían leer).
 *
 * Este test reproduce la cadena: aplica las policies VIEJAS reales de esas
 * migraciones (con la tabla de membresías presente, como en producción), y
 * encima 0052 completa, sentencia a sentencia. Después comprueba que:
 *   1. `project_members` ya no existe;
 *   2. las 21 policies siguen existiendo, con el mismo nombre y comando;
 *   3. su predicado es owner-only (helper, sin `project_members`);
 *   4. el dueño ve sus filas y otro usuario no;
 *   5. el guard de 0052 aborta si queda alguna policy colgando de la tabla.
 */
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  effectiveFunctionDdl,
  migrationStatements,
} from "../helpers/pglite-rls";

const MIGRATION_0052 = "0052_remove_project_members.sql";
const OLD_RLS_MIGRATIONS = [
  "0016_rls_policies.sql",
  "0017_adversary_ptt.sql",
  "0022_rls_intelligence_realtime.sql",
  "0023_rls_write_policies.sql",
  "0024_rls_fase1_project_tables.sql",
];

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Tabla → columna que la policy usa para llegar al proyecto. */
const AFFECTED: Array<[table: string, column: string]> = [
  ["uptime_logs", "project_id"],
  ["anomaly_detections", "project_id"],
  ["adversary_engagements", "project_id"],
  ["adversary_task_nodes", "engagement_id"],
  ["intelligence_findings", "project_id"],
  ["intelligence_assets", "project_id"],
  ["intelligence_investigations", "project_id"],
  ["intelligence_run_events", "investigation_id"],
  ["intelligence_tool_runs", "project_id"],
  ["audits", "project_id"],
  ["crawl_results", "audit_id"],
  ["keyword_targets", "project_id"],
  ["rank_history", "keyword_id"],
  ["integration_data_gsc", "project_id"],
];

/** Las 21 policies membership-based que 0052 debe reescribir (no borrar). */
const EXPECTED_POLICIES = [
  "uptime_logs_select_member_or_owner",
  "anomaly_detections_select_member_or_owner",
  "adversary_engagements_select_member_or_owner",
  "adversary_task_nodes_select_member_or_owner",
  "intelligence_findings_select_member_or_owner",
  "intelligence_assets_select_member_or_owner",
  "intelligence_investigations_select_member_or_owner",
  "intelligence_run_events_select_member_or_owner",
  "intelligence_investigations_insert_member_or_owner",
  "intelligence_investigations_update_member_or_owner",
  "intelligence_findings_insert_member_or_owner",
  "intelligence_assets_insert_member_or_owner",
  "intelligence_run_events_insert_member_or_owner",
  "intelligence_tool_runs_select_member_or_owner",
  "intelligence_tool_runs_insert_member_or_owner",
  "audits_select_member_or_owner",
  "audits_insert_member_or_owner",
  "crawl_results_select_member_or_owner",
  "keyword_targets_select_member_or_owner",
  "rank_history_select_member_or_owner",
  "integration_data_gsc_select_member_or_owner",
] as const;

const FIXTURE = `
  CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL,
    name text NOT NULL
  );
  CREATE TABLE project_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL DEFAULT 'viewer'
  );
  ${AFFECTED.map(([t, col]) => `CREATE TABLE ${t} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ${col} uuid NOT NULL);`).join("\n  ")}
  GRANT SELECT, INSERT, UPDATE, DELETE ON projects, project_members, ${AFFECTED.map(([t]) => t).join(", ")} TO authenticated;
  -- Las migraciones reales activan RLS en estas tablas; sin esto el fixture
  -- mediría «no hay RLS» en vez de «la policy aísla».
  ${AFFECTED.map(([t]) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join("\n  ")}
`;

/**
 * Policies VIEJAS reales: los chunks de 0016–0024 que crean alguna de las 21 y
 * hacen subquery contra `project_members`. Incluyen su `DROP POLICY IF EXISTS`.
 */
function oldPolicies(): string[] {
  const names = new Set<string>(EXPECTED_POLICIES);
  return OLD_RLS_MIGRATIONS.flatMap((f) => migrationStatements(f)).filter(
    (stmt) =>
      /CREATE POLICY/i.test(stmt) &&
      stmt.includes("project_members") &&
      [...names].some((n) => stmt.includes(n)),
  );
}

async function baseDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(effectiveFunctionDdl("current_auth_uid"));
  return db;
}

async function asUser(db: PGlite, userId: string, run: (d: PGlite) => Promise<unknown>) {
  await db.exec("BEGIN");
  try {
    await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await db.exec("SET LOCAL ROLE authenticated");
    return await run(db);
  } finally {
    await db.exec("ROLLBACK");
  }
}

const opened: PGlite[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) await db.close();
});

// Levantar un Postgres en proceso por caso cuesta segundos; en paralelo con la
// suite completa, más. 60s son margen de arranque, no una concesión de lógica.
describe("0052 — project_members eliminado sin dejar tablas fail-closed", { timeout: 60_000 }, () => {
  it("la cadena vieja deja las 21 policies dependiendo de project_members", async () => {
    const db = await baseDb();
    opened.push(db);
    for (const stmt of oldPolicies()) await db.exec(stmt);

    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_policies
        WHERE schemaname = 'public'
          AND (coalesce(qual, '') LIKE '%project_members%' OR coalesce(with_check, '') LIKE '%project_members%')`,
    );
    expect(rows[0]!.n).toBe(EXPECTED_POLICIES.length);
  });

  it("aplicada entera: la tabla desaparece y las 21 policies sobreviven owner-only", async () => {
    const db = await baseDb();
    opened.push(db);
    for (const stmt of oldPolicies()) await db.exec(stmt);
    for (const stmt of migrationStatements(MIGRATION_0052)) await db.exec(stmt);

    const tabla = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_members'`,
    );
    expect(tabla.rows[0]!.n).toBe(0);

    // `qual` es NULL en las policies de INSERT: el predicado vive en `with_check`.
    const { rows } = await db.query<{ policyname: string; predicate: string; cmd: string }>(
      `SELECT policyname, coalesce(qual, '') || coalesce(with_check, '') AS predicate, cmd
         FROM pg_policies
        WHERE schemaname = 'public' AND policyname = ANY($1::text[])
        ORDER BY policyname`,
      [[...EXPECTED_POLICIES]],
    );

    // Ninguna se perdió, ninguna quedó hablando de la tabla borrada.
    expect(rows.map((r) => r.policyname).sort()).toEqual([...EXPECTED_POLICIES].sort());
    for (const row of rows) {
      expect(row.predicate, row.policyname).toContain("user_has_project_access");
      expect(row.predicate, row.policyname).not.toContain("project_members");
    }

    // Los comandos se conservan: 6 INSERT, 1 UPDATE (investigaciones; el de
    // assets/findings lo añadió 0046 y es idempotente) y 14 SELECT.
    const byCmd = (cmd: string) => rows.filter((r) => r.cmd === cmd).length;
    expect({ insert: byCmd("INSERT"), update: byCmd("UPDATE"), select: byCmd("SELECT") }).toEqual({
      insert: 6,
      update: 1,
      select: 14,
    });
  });

  it("tras migrar: el dueño ve sus filas y otro usuario ve 0 (no error)", async () => {
    const db = await baseDb();
    opened.push(db);
    for (const stmt of oldPolicies()) await db.exec(stmt);
    for (const stmt of migrationStatements(MIGRATION_0052)) await db.exec(stmt);

    // Semilla como superusuario, como hacen el seed y los workers. Las hijas
    // sin project_id apuntan a su padre real, así que éste se inserta primero.
    await db.exec(`INSERT INTO projects (id, owner_id, name) VALUES ('${PROJECT_A}', '${USER_A}', 'Proyecto de A');`);
    for (const [table, col] of AFFECTED.filter(([, c]) => c === "project_id")) {
      await db.exec(`INSERT INTO ${table} (${col}) VALUES ('${PROJECT_A}');`);
    }
    const PARENT_OF: Record<string, string> = {
      adversary_task_nodes: "adversary_engagements",
      intelligence_run_events: "intelligence_investigations",
      crawl_results: "audits",
      rank_history: "keyword_targets",
    };
    for (const [table, col] of AFFECTED.filter(([, c]) => c !== "project_id")) {
      await db.exec(`INSERT INTO ${table} (${col}) SELECT id FROM ${PARENT_OF[table]!} LIMIT 1;`);
    }

    for (const [table] of AFFECTED) {
      const propias = await asUser(db, USER_A, (d) =>
        d.query(`SELECT id FROM ${table}`).then((r) => r.rows),
      );
      expect(propias, `${table}: el dueño debe ver su fila`).toHaveLength(1);

      const ajenas = await asUser(db, USER_B, (d) =>
        d.query(`SELECT id FROM ${table}`).then((r) => r.rows),
      );
      expect(ajenas, `${table}: un tercero no debe ver nada`).toHaveLength(0);
    }
  });

  it("el guard aborta si quedara una policy colgando de project_members", async () => {
    const db = await baseDb();
    opened.push(db);
    for (const stmt of oldPolicies()) await db.exec(stmt);

    // Tabla nueva con una policy que 0052 no conoce: sin el guard, el DROP
    // CASCADE se la llevaría sin avisar y la tabla quedaría fail-closed.
    await db.exec(`
      CREATE TABLE legacy_leftover (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL);
      ALTER TABLE legacy_leftover ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "legacy_leftover_select" ON legacy_leftover FOR SELECT TO authenticated
        USING (project_id IN (SELECT pm.project_id FROM project_members pm WHERE pm.user_id = '${USER_A}'::uuid));
    `);

    const stmts = migrationStatements(MIGRATION_0052);
    const err = await (async () => {
      try {
        for (const stmt of stmts) await db.exec(stmt);
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    expect(err, "0052 debía abortar con una policy huérfana").not.toBeNull();
    expect(err!.message).toMatch(/legacy_leftover_select/);

    // Y la tabla sigue ahí: abortó ANTES del DROP.
    const tabla = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_members'`,
    );
    expect(tabla.rows[0]!.n).toBe(1);
  });
});
