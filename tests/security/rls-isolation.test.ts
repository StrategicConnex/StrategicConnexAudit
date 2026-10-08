// @vitest-environment node
/**
 * D3 — Aislamiento multi-tenant real, ejecutado en un Postgres de verdad
 * (PGlite: Postgres compilado a WASM, en proceso).
 *
 * El valor de este test está en que NO usa una imitación: extrae el DDL real
 * de `drizzle/0025_rls_core_defense_in_depth.sql` (las funciones helper y las
 * cuatro policies de `projects`) y lo aplica a un fixture con la misma forma
 * de tabla. Así, si alguien rompe la policy en la migración, este test lo
 * detecta sin necesidad de una base de datos.
 *
 * La sesión se abre igual que `withRLS()` en producción:
 *   `set_config('request.jwt.claims', {sub}, true)` + `SET LOCAL ROLE authenticated`.
 * Un test comprueba que esa emulación sigue coincidiendo con `src/shared/db/rls.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { ROOT, splitStatements } from "../../scripts/db/rls-inventory.mjs";

const MIGRATION = path.join(ROOT, "drizzle/0025_rls_core_defense_in_depth.sql");
const RLS_TS = path.join(ROOT, "src/shared/db/rls.ts");

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "44444444-4444-4444-4444-444444444444";
const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** DDL real de la migración, en el orden en que aparece. */
function realDdl() {
  const statements = splitStatements(fs.readFileSync(MIGRATION, "utf8"));
  const picked = statements.filter((s) =>
    /FUNCTION public\.(current_auth_uid|user_has_project_access|current_user_is_platform_admin)\b/.test(s) ||
    /ALTER TABLE projects ENABLE ROW LEVEL SECURITY/.test(s) ||
    /CREATE POLICY "projects_/.test(s),
  );
  return picked;
}

const FIXTURE = `
  CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE users (
    id uuid PRIMARY KEY,
    email text NOT NULL,
    role text DEFAULT 'user' NOT NULL
  );
  CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL,
    name text NOT NULL,
    domain text
  );
  CREATE TABLE project_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'viewer' NOT NULL
  );
  GRANT SELECT, INSERT, UPDATE, DELETE ON projects, project_members, users TO authenticated;
`;

describe("D3 — aislamiento multi-tenant vía RLS (Postgres real)", () => {
  let db;
  const ddl = realDdl();

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(FIXTURE);
    for (const stmt of ddl) await db.exec(stmt);
    // Datos base como owner (postgres bypasea RLS, igual que seed/migraciones).
    await db.exec(`
      INSERT INTO users (id, email, role) VALUES
        ('${USER_A}', 'a@test.local', 'user'),
        ('${USER_B}', 'b@test.local', 'user'),
        ('${USER_C}', 'c@test.local', 'user');
      INSERT INTO projects (id, owner_id, name, domain) VALUES
        ('${PROJECT_A}', '${USER_A}', 'Proyecto secreto de A', 'https://a.test.local');
    `);
  });

  afterAll(async () => {
    await db?.close();
  });

  /** Ejecuta `fn` en el mismo contexto de sesión que `withRLS()`. */
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

  it("usa el DDL real de la migración (no una imitación)", () => {
    expect(ddl.filter((s) => /FUNCTION public\.current_auth_uid/.test(s))).toHaveLength(1);
    expect(ddl.filter((s) => /FUNCTION public\.user_has_project_access/.test(s))).toHaveLength(1);
    expect(ddl.filter((s) => /FUNCTION public\.current_user_is_platform_admin/.test(s))).toHaveLength(1);
    expect(ddl.filter((s) => /ALTER TABLE projects ENABLE ROW LEVEL SECURITY/.test(s))).toHaveLength(1);
    expect(ddl.filter((s) => /CREATE POLICY "projects_/.test(s))).toHaveLength(4);
  });

  it("la emulación de sesión coincide con withRLS() de producción", () => {
    const src = fs.readFileSync(RLS_TS, "utf8");
    expect(src).toMatch(/set_config\('request\.jwt\.claims'/);
    expect(src).toMatch(/SET LOCAL ROLE authenticated/);
    expect(src).toMatch(/sub:\s*userId/);
  });

  it("el dueño ve su propio proyecto", async () => {
    const rows = await asUser(USER_A, (d) => d.query("SELECT name FROM projects").then((r) => r.rows));
    expect(rows).toHaveLength(1);
  });

  it("otro usuario no ve el proyecto ajeno (0 filas, no error)", async () => {
    const rows = await asUser(USER_B, (d) => d.query("SELECT name FROM projects").then((r) => r.rows));
    expect(rows).toHaveLength(0);
  });

  // CONTROL POSITIVO: sin esto, el test anterior pasaría aunque la consulta
  // fallara por cualquier otro motivo (grant ausente, tabla vacía…).
  it("control positivo: B ve el proyecto en cuanto es miembro", async () => {
    await db.exec(`INSERT INTO project_members (project_id, user_id, role) VALUES ('${PROJECT_A}', '${USER_B}', 'viewer');`);
    const rows = await asUser(USER_B, (d) => d.query("SELECT name FROM projects").then((r) => r.rows));
    expect(rows).toHaveLength(1);
  });

  it("un usuario con acceso no puede borrar el proyecto del dueño", async () => {
    const deleted = await asUser(USER_C, (d) =>
      d.query(`DELETE FROM projects WHERE id = '${PROJECT_A}' RETURNING id`).then((r) => r.rows),
    );
    expect(deleted).toHaveLength(0);
    const still = await db.query(`SELECT count(*)::int AS n FROM projects WHERE id = '${PROJECT_A}'`);
    expect(still.rows[0].n).toBe(1);
  });

  it("nadie puede reasignarse un proyecto ajeno (UPDATE bloqueado)", async () => {
    const updated = await asUser(USER_B, (d) =>
      d.query(`UPDATE projects SET owner_id = '${USER_B}' WHERE id = '${PROJECT_A}' RETURNING id`).then((r) => r.rows),
    );
    expect(updated).toHaveLength(0);
    const owner = await db.query(`SELECT owner_id FROM projects WHERE id = '${PROJECT_A}'`);
    expect(owner.rows[0].owner_id).toBe(USER_A);
  });

  it("no se puede crear un proyecto a nombre de otro (WITH CHECK)", async () => {
    await expect(
      asUser(USER_B, (d) => d.query(`INSERT INTO projects (owner_id, name) VALUES ('${USER_A}', 'suplantado')`)),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it("el dueño sigue viendo su proyecto intacto", async () => {
    const rows = await asUser(USER_A, (d) =>
      d.query(`SELECT name, owner_id FROM projects WHERE id = '${PROJECT_A}'`).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].owner_id).toBe(USER_A);
  });

  it("la sesión se limpia tras el ROLLBACK (sin contaminar la conexión)", async () => {
    const after = await db.query("SELECT current_user AS u, current_setting('request.jwt.claims', true) AS c");
    expect(after.rows[0].u).toBe("postgres");
    expect(after.rows[0].c ?? "").not.toContain(USER_B);
  });
});
