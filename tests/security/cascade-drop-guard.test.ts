// @vitest-environment node
/**
 * Guard de `DROP TABLE … CASCADE` — el patrón que casi rompió P2-16.
 *
 * La 0052 elimina `project_members`, y 21 policies de otras tablas la leían en
 * subqueries: el CASCADE las habría borrado en silencio, dejando esas tablas
 * con RLS y sin policy (fail-closed, «0 filas»). Estos casos fijan que el guard
 * (a) ve el acoplamiento, (b) no se traga el patrón de reparación de la propia
 * 0052 —recrear la policy antes del DROP— y (c) recorre las migraciones en el
 * orden del journal, no en el alfabético.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeCascadeDrops,
  formatFinding,
  referencesTable,
} from "../../scripts/db/check-cascade-drop.mjs";

const ROOT = process.cwd();
const GUARD = path.join(ROOT, "scripts/db/check-cascade-drop.mjs");

interface GuardRun {
  status: number;
  stdout: string;
  stderr: string;
}

/** Ejercita el CLI real (el contrato de exit codes que consume CI). */
function runGuard(migrationsDir: string): GuardRun {
  try {
    const out = execFileSync(process.execPath, [GUARD, "--migrations-dir", migrationsDir], {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 30_000,
    });
    return { status: 0, stdout: String(out), stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: e.status ?? -1,
      stdout: String(e.stdout ?? ""),
      stderr: String(e.stderr ?? ""),
    };
  }
}

/** Escribe un mini-árbol de migraciones + journal y devuelve su ruta. */
function fixture(tags: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cascade-drop-"));
  fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: tags.map((tag, idx) => ({ idx, version: "7", when: idx, tag, breakpoints: true })),
    })
  );
  return dir;
}

function withMigrations(entries: [tag: string, sql: string][]) {
  const dir = fixture(entries.map(([tag]) => tag));
  for (const [tag, sql] of entries) fs.writeFileSync(path.join(dir, `${tag}.sql`), sql);
  return dir;
}

const projectTable = `
CREATE TABLE IF NOT EXISTS "projects" ("id" uuid PRIMARY KEY, "owner_id" uuid);
`;

/** Policy de SELECT con la subquery de membresía, como 0016/0022/0023/0024. */
const memberPolicy = (table: string, name = "select_member_or_owner") => `
DROP POLICY IF EXISTS "${name}" ON ${table};
CREATE POLICY "${name}" ON ${table} FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects pr
    WHERE pr.id = ${table}.project_id
      AND (pr.owner_id = public.current_auth_uid()
        OR EXISTS (
          SELECT pm.project_id FROM project_members pm
          WHERE pm.project_id = pr.id
            AND pm.user_id = public.current_auth_uid()
        ))
  ));
`;

const ownerOnlyPolicy = (table: string, name = "select_member_or_owner") => `
DROP POLICY IF EXISTS "${name}" ON ${table};
CREATE POLICY "${name}" ON ${table} FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
`;

describe("guard DROP TABLE … CASCADE", () => {
  it("marca la policy viva de OTRA tabla que lee la tabla borrada", () => {
    const dir = withMigrations([
      [
        "0001_tables",
        `${projectTable}CREATE TABLE IF NOT EXISTS audits (project_id uuid);\n${memberPolicy("audits")}`,
      ],
      ["0002_drop_members", `DROP TABLE IF EXISTS project_members CASCADE;`],
    ]);

    const report = analyzeCascadeDrops({ migrationsDir: dir });

    expect(report.ok).toBe(false);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      migration: "0002_drop_members.sql",
      table: "project_members",
      kind: "policy",
      object: "audits.select_member_or_owner",
    });
    expect(formatFinding(report.findings[0])).toContain(
      "CASCADE rompe policy audits.select_member_or_owner"
    );
  });

  it("no marca el patrón de reparación de la 0052 (recrear la policy antes del DROP)", () => {
    const dir = withMigrations([
      [
        "0001_tables",
        `${projectTable}CREATE TABLE IF NOT EXISTS audits (project_id uuid);\n${memberPolicy("audits")}`,
      ],
      ["0002_owner_only", ownerOnlyPolicy("audits")],
      ["0003_drop_members", `DROP TABLE IF EXISTS public.project_members CASCADE;`],
    ]);

    const report = analyzeCascadeDrops({ migrationsDir: dir });

    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("no marca DROP TABLE sin CASCADE (Postgres fallaría en vez de borrar en silencio)", () => {
    const dir = withMigrations([
      [
        "0001_tables",
        `${projectTable}CREATE TABLE IF NOT EXISTS audits (project_id uuid);\n${memberPolicy("audits")}`,
      ],
      ["0002_drop_members", `DROP TABLE IF EXISTS project_members;`],
    ]);

    const report = analyzeCascadeDrops({ migrationsDir: dir });

    expect(report.findings).toEqual([]);
    expect(report.drops).toEqual([
      { migration: "0002_drop_members.sql", table: "project_members", cascade: false, line: 1 },
    ]);
  });

  it("no reporta las policies de la propia tabla que se borra", () => {
    const dir = withMigrations([
      [
        "0001_tables",
        `${projectTable}CREATE TABLE IF NOT EXISTS project_members (user_id uuid);
DROP POLICY IF EXISTS project_members_select_own ON project_members;
CREATE POLICY project_members_select_own ON project_members FOR SELECT TO authenticated
  USING (user_id = public.current_auth_uid());`,
      ],
      ["0002_drop_members", `DROP TABLE IF EXISTS project_members CASCADE;`],
    ]);

    expect(analyzeCascadeDrops({ migrationsDir: dir }).ok).toBe(true);
  });

  it("detecta una función SECURITY DEFINER que seguiría leyendo la tabla", () => {
    const dir = withMigrations([
      [
        "0001_helper",
        `${projectTable}
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = p_project_id AND pm.user_id = public.current_auth_uid()
  )
$$;`,
      ],
      ["0002_drop_members", `DROP TABLE IF EXISTS project_members CASCADE;`],
    ]);

    const report = analyzeCascadeDrops({ migrationsDir: dir });

    expect(report.ok).toBe(false);
    expect(report.findings[0]).toMatchObject({
      kind: "function",
      object: "public.user_has_project_access()",
    });
  });

  it("una función redefinida owner-only antes del DROP deja de ser un hallazgo", () => {
    const dir = withMigrations([
      [
        "0001_helper",
        `${projectTable}
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p_project_id)
$$;`,
      ],
      [
        "0002_helper_owner_only",
        `
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM projects pr WHERE pr.id = p_project_id)
$$;`,
      ],
      ["0003_drop_members", `DROP TABLE IF EXISTS project_members CASCADE;`],
    ]);

    expect(analyzeCascadeDrops({ migrationsDir: dir }).ok).toBe(true);
  });

  it("detecta SQL dinámico que menciona la tabla (EXECUTE format de 0027)", () => {
    const dir = withMigrations([
      [
        "0001_dynamic",
        `${projectTable}
DO $$
BEGIN
  EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_id))', 'x', 'audits');
END $$;`,
      ],
      ["0002_drop_members", `DROP TABLE IF EXISTS project_members CASCADE;`],
    ]);

    const report = analyzeCascadeDrops({ migrationsDir: dir });

    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.kind)).toContain("dynamic");
  });

  it("recorre las migraciones en orden de journal, no alfabético", () => {
    // Alfabéticamente `a_second` iría antes que `z_first`: el guard vería el
    // DROP sin policies y daría el caso por seguro.
    const dir = withMigrations([
      [
        "z_first",
        `${projectTable}CREATE TABLE IF NOT EXISTS audits (project_id uuid);\n${memberPolicy("audits")}`,
      ],
      ["a_second", `DROP TABLE IF EXISTS project_members CASCADE;`],
    ]);

    expect(analyzeCascadeDrops({ migrationsDir: dir }).ok).toBe(false);
  });

  it("reporta la línea real del DROP (los comentarios no la desplazan)", () => {
    const dir = withMigrations([
      ["0001_drop", `-- uno\n-- dos\n\n-- tres\nDROP TABLE IF EXISTS project_members CASCADE;`],
    ]);

    expect(analyzeCascadeDrops({ migrationsDir: dir }).drops[0].line).toBe(5);
  });

  it("sólo considera referencias como relación o columna calificada", () => {
    expect(referencesTable("EXISTS (SELECT 1 FROM project_members pm)", "project_members")).toBe(
      true
    );
    expect(
      referencesTable("EXISTS (SELECT 1 FROM public.project_members pm)", "project_members")
    ).toBe(true);
    expect(referencesTable("project_members.user_id = auth.uid()", "project_members")).toBe(true);
    // Un literal con el nombre (el guard `DO $$ … LIKE '%project_members%'` de
    // la 0052) no es una dependencia SQL.
    expect(referencesTable("qual LIKE '%project_members%'", "project_members")).toBe(false);
    // Un nombre que sólo lo contiene como prefijo tampoco.
    expect(referencesTable("FROM project_members_archive a", "project_members")).toBe(false);
  });

  it("habría visto el bug real: estado de 0051 + DROP CASCADE sin recrear policies", () => {
    // Reconstruye exactamente el escenario que la 0052 evita: todas las
    // migraciones reales hasta 0051 y una 0052 que sólo borra la tabla.
    const real = path.join(ROOT, "drizzle");
    const journal = JSON.parse(fs.readFileSync(path.join(real, "meta", "_journal.json"), "utf8"));
    const before = journal.entries.filter((e: { tag: string }) => e.tag < "0052");
    const dir = fixture([...before.map((e: { tag: string }) => e.tag), "0052_brutal_drop"]);
    for (const e of before)
      fs.copyFileSync(path.join(real, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
    fs.writeFileSync(
      path.join(dir, "0052_brutal_drop.sql"),
      "DROP TABLE IF EXISTS public.project_members CASCADE;"
    );

    const report = analyzeCascadeDrops({ migrationsDir: dir });
    const policies = report.findings.filter((f) => f.kind === "policy");

    expect(report.ok).toBe(false);
    expect(policies).toHaveLength(21);
    expect(policies.map((f) => f.object)).toEqual(
      expect.arrayContaining([
        "uptime_logs.uptime_logs_select_member_or_owner",
        "intelligence_findings.intelligence_findings_select_member_or_owner",
        "audits.audits_select_member_or_owner",
        "crawl_results.crawl_results_select_member_or_owner",
        "integration_data_gsc.integration_data_gsc_select_member_or_owner",
      ])
    );
  });

  it("CLI: exit 1 cuando el DROP CASCADE rompería una policy (lo que verá CI)", () => {
    const dir = withMigrations([
      [
        "0001_tables",
        `${projectTable}CREATE TABLE IF NOT EXISTS audits (project_id uuid);\n${memberPolicy("audits")}`,
      ],
      ["0002_drop_members", `DROP TABLE IF EXISTS project_members CASCADE;`],
    ]);

    const run = runGuard(dir);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("DROP CASCADE rompería dependencias vivas");
    expect(run.stderr).toContain("audits.select_member_or_owner");
  });

  it("CLI: exit 0 con el patrón seguro de la 0052", () => {
    const dir = withMigrations([
      [
        "0001_tables",
        `${projectTable}CREATE TABLE IF NOT EXISTS audits (project_id uuid);\n${memberPolicy("audits")}`,
      ],
      ["0002_owner_only", ownerOnlyPolicy("audits")],
      ["0003_drop_members", `DROP TABLE IF EXISTS public.project_members CASCADE;`],
    ]);

    const run = runGuard(dir);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("DROP CASCADE guard: OK");
  });

  it("CLI: exit 2 (nunca 0) cuando no puede analizar el directorio", () => {
    const run = runGuard(path.join(os.tmpdir(), "cascade-drop-inexistente"));

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("No se pudo analizar");
  });

  it("pasa sobre las migraciones reales del repo (0052 incluida)", () => {
    const report = analyzeCascadeDrops();

    expect(report.unjournaled).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.drops).toContainEqual({
      migration: "0052_remove_project_members.sql",
      table: "project_members",
      cascade: true,
      line: 200,
    });
    expect(report.ok).toBe(true);
  });

  it("las migraciones reales tienen journal y todos sus .sql entran en el análisis", () => {
    const journal = JSON.parse(
      fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8")
    );
    const sqlFiles = fs
      .readdirSync(path.join(ROOT, "drizzle"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""));

    expect(journal.entries).toHaveLength(sqlFiles.length);
  });
});
