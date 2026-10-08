// @vitest-environment node
/**
 * C7 — Inventario RLS: compara el schema de Drizzle, las migraciones de
 * `drizzle/` y `scripts/db/rls-manifest.json` SIN base de datos, y falla si
 * una tabla multi-tenant deja de estar aislada.
 *
 * Los casos negativos usan fixtures en un directorio temporal para probar que
 * el guard realmente detecta cada violación (un guard que solo dice «ok» no
 * vale de nada).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildInventory, checkInventory, loadManifest } from "../../scripts/db/rls-inventory.mjs";

/** Crea un repo mínimo (schema + migraciones) en un directorio temporal. */
function fixture({ schema, migrations }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rls-inv-"));
  const schemaDir = path.join(root, "schemas");
  const migrationsDir = path.join(root, "drizzle");
  fs.mkdirSync(schemaDir);
  fs.mkdirSync(migrationsDir);
  for (const [file, src] of Object.entries(schema)) fs.writeFileSync(path.join(schemaDir, file), src);
  for (const [file, src] of Object.entries(migrations)) fs.writeFileSync(path.join(migrationsDir, file), src);
  return { schemaDir, migrationsDir };
}

/** Tabla de fixture con una columna y, opcionalmente, project_id. */
const table = (name, { projectId = true } = {}) => `
import { pgTable, uuid, text } from "drizzle-orm/pg-core";
export const ${name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())} = pgTable("${name}", {
  id: uuid("id").primaryKey(),
${projectId ? '  projectId: uuid("project_id").notNull(),\n' : ""}  name: text("name"),
});
`;

const rls = (t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`;
const policy = (t, name = `${t}_member_or_owner`) =>
  `CREATE POLICY "${name}" ON ${t} FOR SELECT TO authenticated USING (public.user_has_project_access(project_id));`;
const sql = (...stmts) => stmts.join("\n--> statement-breakpoint\n");

const manifestFor = (tenant = [], extra = {}) => ({
  tenant,
  publicCatalogs: {},
  failClosed: {},
  rlsExceptions: {},
  ...extra,
});

describe("inventario RLS (C7) — repo real", () => {
  const { rows, hard, soft, ok } = checkInventory();

  it("no tiene problemas duros y cubre todas las tablas del schema", () => {
    expect(hard).toEqual([]);
    expect(ok).toBe(true);
    expect(rows.length).toBeGreaterThan(70);
  });

  it("toda tabla de public tiene RLS habilitado", () => {
    expect(rows.filter((r) => !r.rls).map((r) => r.table)).toEqual([]);
  });

  it("clasifica cada tabla del schema (sin huérfanas ni entradas obsoletas)", () => {
    const manifest = loadManifest();
    const classified = new Set([
      ...manifest.tenant,
      ...Object.keys(manifest.publicCatalogs),
      ...Object.keys(manifest.failClosed),
      ...Object.keys(manifest.rlsExceptions),
    ]);
    expect(rows.map((r) => r.table).filter((t) => !classified.has(t))).toEqual([]);
    // Y toda tabla clasificada debe existir de verdad en el schema.
    const schemaTables = new Set(rows.map((r) => r.table));
    expect([...classified].filter((t) => !schemaTables.has(t))).toEqual([]);
  });

  it("projects conserva RLS y sus 4 policies (select/insert/update/delete)", () => {
    const projects = rows.find((r) => r.table === "projects");
    expect(projects?.rls).toBe(true);
    expect(projects?.policies.sort()).toEqual([
      "projects_delete_owner",
      "projects_insert_owner",
      "projects_select_member_or_owner",
      "projects_update_owner",
    ]);
  });

  it("reporta las tablas fail-closed sin policy como aviso, no como problema duro", () => {
    const failClosed = Object.keys(loadManifest().failClosed);
    expect(failClosed.length).toBeGreaterThan(0);
    for (const t of failClosed) {
      const row = rows.find((r) => r.table === t);
      expect(row?.policies).toEqual([]);
      expect(hard.some((h) => h.includes(`"${t}"`))).toBe(false);
    }
    expect(soft.some((s) => s.includes("fail-closed"))).toBe(true);
  });
});

describe("inventario RLS (C7) — detección de violaciones", () => {
  it("falla si una tabla tenant pierde ENABLE ROW LEVEL SECURITY", () => {
    const dirs = fixture({
      schema: { "a.ts": table("projects") },
      migrations: { "0.sql": sql(policy("projects")) },
    });
    const res = checkInventory(manifestFor(["projects"]), dirs);
    expect(res.ok).toBe(false);
    expect(res.hard.join(" | ")).toMatch(/SIN RLS|sin ENABLE ROW LEVEL SECURITY/);
  });

  it("falla si hay GRANT a authenticated sobre una tabla sin RLS", () => {
    const dirs = fixture({
      schema: { "a.ts": table("leaky") },
      migrations: { "0.sql": sql(policy("leaky"), "GRANT SELECT ON leaky TO authenticated;") },
    });
    const res = checkInventory(manifestFor(["leaky"]), dirs);
    expect(res.ok).toBe(false);
    expect(res.hard.join(" | ")).toMatch(/exposición cross-tenant/);
  });

  it("falla si una tabla tenant se queda sin ninguna policy", () => {
    const dirs = fixture({
      schema: { "a.ts": table("projects") },
      migrations: { "0.sql": sql(rls("projects")) },
    });
    const res = checkInventory(manifestFor(["projects"]), dirs);
    expect(res.ok).toBe(false);
    expect(res.hard.join(" | ")).toMatch(/sin ninguna policy/);
  });

  it("falla si aparece una tabla nueva sin clasificar en el manifest", () => {
    const dirs = fixture({
      schema: { "a.ts": table("projects"), "b.ts": table("tabla_nueva") },
      migrations: { "0.sql": sql(rls("projects"), policy("projects"), rls("tabla_nueva"), policy("tabla_nueva")) },
    });
    const res = checkInventory(manifestFor(["projects", "tabla_nueva"]), dirs);
    expect(res.ok).toBe(true); // la tabla nueva está clasificada...
    const sinClasificar = checkInventory(manifestFor(["projects"]), dirs);
    expect(sinClasificar.ok).toBe(false);
    expect(sinClasificar.hard.join(" | ")).toMatch(/"tabla_nueva" no está clasificada/);
  });

  it("falla si el manifest referencia una tabla que ya no existe", () => {
    const dirs = fixture({
      schema: { "a.ts": table("projects") },
      migrations: { "0.sql": sql(rls("projects"), policy("projects")) },
    });
    const res = checkInventory(manifestFor(["projects", "tabla_borrada"]), dirs);
    expect(res.ok).toBe(false);
    expect(res.hard.join(" | ")).toMatch(/manifest obsoleto: "tabla_borrada"/);
  });

  it("solo exime de RLS lo declarado expresamente en rlsExceptions", () => {
    const dirs = fixture({
      schema: { "a.ts": table("catalogo") },
      migrations: { "0.sql": "SELECT 1;" },
    });
    expect(checkInventory(manifestFor([], { rlsExceptions: { catalogo: "catálogo público, sin datos de tenant" } }), dirs).ok).toBe(true);

    // Una excepción que sí tiene RLS es una entrada obsoleta → falla.
    const conRls = fixture({
      schema: { "a.ts": table("catalogo") },
      migrations: { "0.sql": sql(rls("catalogo")) },
    });
    const res = checkInventory(manifestFor([], { rlsExceptions: { catalogo: "ya no aplica" } }), conRls);
    expect(res.ok).toBe(false);
    expect(res.hard.join(" | ")).toMatch(/rlsExceptions pero SÍ tiene RLS/);
  });

  it("no acredita la policy dinámica de 0027 cuando la tabla no tiene project_id", () => {
    const dirs = fixture({
      schema: { "a.ts": table("sin_project", { projectId: false }) },
      migrations: {
        "0.sql": sql(
          rls("sin_project"),
          `DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['sin_project'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (public.user_has_project_access(project_id))', t || '_fase2', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'omitida';
    END;
  END LOOP;
END $$;`,
        ),
      },
    });
    const { rows } = buildInventory(dirs);
    expect(rows[0].policies).toEqual([]);
    expect(rows[0].notes.join(" ")).toMatch(/sin columna project_id/);
    // Y por tanto NO puede clasificarse como tenant sin que el guard lo note.
    const res = checkInventory(manifestFor(["sin_project"]), dirs);
    expect(res.ok).toBe(false);
    expect(res.hard.join(" | ")).toMatch(/sin ninguna policy/);
  });
});
