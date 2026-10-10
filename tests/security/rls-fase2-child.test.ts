// @vitest-environment node
/**
 * 0027 (fix) — Regresión del bug del bloque dinámico.
 *
 * El bloque `DO $$ ... EXCEPTION WHEN OTHERS ... $$` de 0027 se tragaba en
 * silencio los `CREATE POLICY` de cinco tablas hijas sin `project_id`
 * (integration_sync_logs, competitor_keywords, backlink_history,
 * ab_test_results, report_exports): quedaban fail-closed sin que nadie se
 * enterara. Este test:
 *
 *   1) Verifica estáticamente que el bloque dinámico YA NO traga el error.
 *   2) Aplica el DDL real de esas cinco policies a un Postgres de verdad
 *      (PGlite) y comprueba que aíslan de verdad: el dueño ve sus filas, un
 *      usuario ajeno no ve ninguna.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { ROOT, splitStatements } from "../../scripts/db/rls-inventory.mjs";

const MIG_0025 = path.join(ROOT, "drizzle/0025_rls_core_defense_in_depth.sql");
const MIG_0027 = path.join(ROOT, "drizzle/0027_rls_fase2.sql");

/** Tabla hija → columna FK hacia su padre. */
const CHILDREN = [
  ["integration_sync_logs", "integration_id"],
  ["competitor_keywords", "competitor_id"],
  ["backlink_history", "backlink_id"],
  ["ab_test_results", "test_id"],
  ["report_exports", "report_id"],
];
const PARENTS = ["integrations", "competitors", "backlinks", "ab_tests", "reports"];

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_C = "44444444-4444-4444-4444-444444444444";
const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** DDL real de las funciones helper usadas por la policy (de 0025). */
function helperDdl() {
  return splitStatements(fs.readFileSync(MIG_0025, "utf8")).filter((s) =>
    /FUNCTION public\.(current_auth_uid|user_has_project_access)\b/.test(s),
  );
}

/** DDL real de las cinco policies hijas (de 0027, ya corregido). */
function childPolicyDdl() {
  const stmts = splitStatements(fs.readFileSync(MIG_0027, "utf8"));
  const out = [];
  for (const [table] of CHILDREN) {
    const found = stmts.filter((s) => new RegExp(`CREATE POLICY ${table}_fase2 ON ${table}\\b`).test(s));
    expect(found, `policy ${table}_fase2 no encontrada en 0027`).toHaveLength(1);
    out.push(...found);
  }
  return out;
}

const FIXTURE = `
  CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL, role text DEFAULT 'user' NOT NULL);
  CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, name text NOT NULL);
  CREATE TABLE project_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, user_id uuid NOT NULL, role text DEFAULT 'viewer' NOT NULL);
  ${[...PARENTS, ...CHILDREN.map(([t]) => t)]
    .map((t) => `CREATE TABLE ${t} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ${t === "ab_test_results" ? "test_id" : t === "report_exports" ? "report_id" : t === "competitor_keywords" ? "competitor_id" : t === "backlink_history" ? "backlink_id" : t === "integration_sync_logs" ? "integration_id" : "project_id"} uuid NOT NULL);`)
    .join("\n  ")}
  ${CHILDREN.map(([t]) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join("\n  ")}
  GRANT SELECT, INSERT, UPDATE, DELETE ON ${[...PARENTS, ...CHILDREN.map(([t]) => t)].join(", ")} TO authenticated;
`;

describe("0027 fix — policies de las hijas sin project_id (Postgres real)", () => {
  let db;
  const helpers = helperDdl();
  const policies = childPolicyDdl();

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(FIXTURE);
    for (const stmt of helpers) await db.exec(stmt);
    for (const stmt of policies) await db.exec(stmt);
    // Datos como owner (postgres bypasea RLS), igual que seed/migraciones.
    await db.exec(`
      INSERT INTO users (id, email, role) VALUES
        ('${USER_A}', 'a@test.local', 'user'),
        ('${USER_C}', 'c@test.local', 'user');
      INSERT INTO projects (id, owner_id, name) VALUES ('${PROJECT_A}', '${USER_A}', 'Proyecto de A');
    `);
    const inserts = [];
    for (const parent of PARENTS) {
      inserts.push(`INSERT INTO ${parent} (id, project_id) VALUES ('${parentUnique(parent)}', '${PROJECT_A}');`);
    }
    for (const [child, fk] of CHILDREN) {
      const parent = parentOf(child);
      inserts.push(`INSERT INTO ${child} (id, ${fk}) VALUES ('${childUnique(child)}', '${parentUnique(parent)}');`);
    }
    await db.exec(inserts.join("\n"));
  });

  afterAll(async () => {
    await db?.close();
  });

  async function asUser(userId, run) {
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

  it("el bloque dinámico de 0027 ya no traga el error en silencio", () => {
    const src = fs.readFileSync(MIG_0027, "utf8");
    const dynamicBlock = splitStatements(src).find((s) => /EXECUTE\s+format\(\s*'CREATE\s+POLICY\s+%I\s+ON\s+%I/i.test(s));
    expect(dynamicBlock, "bloque dinámico no encontrado").toBeTruthy();
    expect(dynamicBlock).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i);
  });

  it("ninguna de las hijas quedó en el ARRAY dinámico de 0027", () => {
    const src = fs.readFileSync(MIG_0027, "utf8");
    const dynamicBlock = splitStatements(src).find((s) => /EXECUTE\s+format\(\s*'CREATE\s+POLICY\s+%I\s+ON\s+%I/i.test(s));
    for (const [child] of CHILDREN) {
      expect(dynamicBlock).not.toContain(`'${child}'`);
    }
  });

  it("cada hija tiene exactamente una policy y referencia a su padre", () => {
    for (const [child] of CHILDREN) {
      const mine = policies.filter((s) => new RegExp(`ON ${child}\\b`).test(s));
      expect(mine).toHaveLength(1);
      expect(mine[0]).toContain(`public.user_has_project_access`);
    }
  });

  it("el dueño ve las filas de sus hijas", async () => {
    for (const [child] of CHILDREN) {
      const rows = await asUser(USER_A, (d) => d.query(`SELECT id FROM ${child}`).then((r) => r.rows));
      expect(rows, child).toHaveLength(1);
    }
  });

  it("un usuario ajeno no ve ninguna fila de las hijas (0 filas, no error)", async () => {
    for (const [child] of CHILDREN) {
      const rows = await asUser(USER_C, (d) => d.query(`SELECT id FROM ${child}`).then((r) => r.rows));
      expect(rows, child).toHaveLength(0);
    }
  });

  // CONTROL POSITIVO: sin esto, el test anterior pasaría aunque la consulta
  // fallara por otra razón (grant ausente, tabla vacía, policy mal escrita).
  it("control positivo: C ve las filas en cuanto es miembro del proyecto", async () => {
    await db.exec(`INSERT INTO project_members (project_id, user_id, role) VALUES ('${PROJECT_A}', '${USER_C}', 'viewer');`);
    for (const [child] of CHILDREN) {
      const rows = await asUser(USER_C, (d) => d.query(`SELECT id FROM ${child}`).then((r) => r.rows));
      expect(rows, child).toHaveLength(1);
    }
  });
});

function parentOf(child) {
  return {
    integration_sync_logs: "integrations",
    competitor_keywords: "competitors",
    backlink_history: "backlinks",
    ab_test_results: "ab_tests",
    report_exports: "reports",
  }[child];
}
function parentUnique(parent) {
  return `00000000-0000-0000-0000-0000000000${String(PARENTS.indexOf(parent) + 1).padStart(2, "0")}`;
}
function childUnique(child) {
  return `11111111-0000-0000-0000-0000000000${String(CHILDREN.findIndex(([c]) => c === child) + 1).padStart(2, "0")}`;
}
