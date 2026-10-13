/**
 * helpers/pglite-rls.ts — Arnés compartido para los tests de aislamiento RLS
 * (P0.2) sobre Postgres real en proceso (PGlite).
 *
 * POR QUÉ EXISTE: cada servicio que sale de `directDb` hacia la autoridad del
 * llamante (patrón P0.2, ver src/shared/db/executor.ts) necesita el mismo test:
 * "este servicio, con la sesión de otro tenant, no ve ni escribe sus filas".
 * Montarlo a mano por servicio duplicaba ~90 líneas de fixture. Aquí queda una
 * sola vez, y sigue el criterio del test de aislamiento existente
 * (tests/security/rls-isolation.test.ts): NO se imita la política, se extrae el
 * DDL REAL de las migraciones.
 *
 *   - policies de proyecto (`FOR ALL … user_has_project_access`): plantilla del
 *     bloque fase 2 de la migración 0027, instanciada para la tabla concreta;
 *   - funciones helper `current_auth_uid()` / `user_has_project_access()`: 0025;
 *   - tabla: su `CREATE TABLE` real (0010 para el historial, 0003 para las tablas
 *     de inteligencia) y, cuando hace falta, el `CREATE TYPE` de sus enums;
 *   - sesión: idéntica a `withRLS()`
 *     (`set_config('request.jwt.claims', …, true)` + `SET LOCAL ROLE authenticated`).
 *
 * SUPUESTO DOCUMENTADO: los privilegios de tabla se conceden explícitamente en
 * el fixture. En la base live vienen de los DEFAULT PRIVILEGES de Supabase (por
 * eso 0042 tuvo que REVOKE TRUNCATE a mano). Estos tests verifican la POLICY
 * —el aislamiento—, no el estado real de los grants: eso lo comprueba el job de
 * CI que sí tiene `DIRECT_URL`.
 */

import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { ROOT, splitStatements } from "../../scripts/db/rls-inventory.mjs";
import type { DbExecutor } from "@/shared/db/executor";

const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
const MIGRATION_CORE = path.join(MIGRATIONS_DIR, "0025_rls_core_defense_in_depth.sql");
const MIGRATION_FASE2 = path.join(MIGRATIONS_DIR, "0027_rls_fase2.sql");

/** Handle de drizzle sobre PGlite (el fixture solo lo usa para abrir sesión). */
export type RlsOrm = ReturnType<typeof drizzle>;

/** Funciones helper reales de la migración 0025, usadas por las policies. */
export function helperFunctions(): string[] {
  return (splitStatements(fs.readFileSync(MIGRATION_CORE, "utf8")) as string[]).filter((s) =>
    /FUNCTION public\.(current_auth_uid|user_has_project_access)\b/.test(s),
  );
}

/** Primera sentencia de las migraciones que casa con `re` (se leen en orden de archivo). */
function findStatement(re: RegExp, what: string): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const [stmt] = (splitStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")) as string[]).filter(
      (s) => re.test(s),
    );
    if (stmt) return stmt;
  }
  throw new Error(`No se encontró ${what} en drizzle/`);
}

/**
 * `CREATE TABLE … "<table>" …` real, tal como lo escribió su migración. Se busca
 * en **todas** las migraciones: 0003 declara las tablas de inteligencia y 0010 el
 * historial DNS/WHOIS, y la primera que crea la tabla es la que manda.
 */
export function realTableDdl(table: string): string {
  return findStatement(
    new RegExp(`^CREATE TABLE (IF NOT EXISTS )?"${table}"`),
    `el CREATE TABLE de ${table}`,
  );
}

/** `CREATE TYPE "public"."<type>"` real: los enums que usan esas tablas. */
export function realTypeDdl(type: string): string {
  return findStatement(
    new RegExp(`^CREATE TYPE (?:"public"\\.|public\\.)"?${type}"?`),
    `el CREATE TYPE de ${type}`,
  );
}

/** Sentencias de una migración concreta, ya sin comentarios. */
export function migrationStatements(fileName: string): string[] {
  const file = path.join(MIGRATIONS_DIR, fileName);
  if (!fs.existsSync(file)) throw new Error(`No existe la migración ${fileName} en drizzle/`);
  return splitStatements(fs.readFileSync(file, "utf8")) as string[];
}

/**
 * Subconjunto de una migración que casa con `re` — para aplicar las policies
 * REALES de una tabla concreta (grants y policies incluidas) sin imitarlas.
 */
export function statementsMatching(fileName: string, re: RegExp): string[] {
  return migrationStatements(fileName).filter((s) => re.test(s));
}

/** Bloque dinámico de 0027 que crea las policies fase 2 (plantilla + listado). */
export function fase2Block(): string {
  const [block] = (splitStatements(fs.readFileSync(MIGRATION_FASE2, "utf8")) as string[]).filter(
    (s) => /FOREACH t IN ARRAY tables LOOP/.test(s),
  );
  if (!block) throw new Error("No se encontró el bloque de policies fase 2 en 0027");
  return block;
}

/** Plantilla `CREATE POLICY %I ON %I FOR ALL TO authenticated …` de ese bloque. */
export function policyTemplate(): string {
  const [template] = [...fase2Block().matchAll(/'CREATE POLICY [^']*'/g)].map((m) =>
    m[0].slice(1, -1),
  );
  if (!template) throw new Error("No se encontró la plantilla CREATE POLICY en 0027");
  return template;
}

/** Instancia la plantilla de la migración con nombre de policy y tabla concretos. */
export function instantiatePolicy(template: string, policyName: string, table: string): string {
  const idents = [`"${policyName}"`, `"${table}"`];
  let i = 0;
  return template.replace(/%I/g, () => idents[i++] ?? "");
}

/** Forma de las tablas raíz multi-tenant que usan las policies (projects/miembros). */
const BASE_TABLES = `
  CREATE ROLE authenticated NOLOGIN;
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
`;

export interface RlsFixture {
  pg: PGlite;
  orm: RlsOrm;
  /** Abre la sesión exactamente como `withRLS()` y entrega su transacción. */
  asUser<T>(userId: string, run: (tx: DbExecutor) => Promise<T>): Promise<T>;
}

/** Sesión idéntica a `withRLS()`: claims + `SET LOCAL ROLE` dentro de una transacción. */
function sessionOf(orm: RlsOrm): RlsFixture["asUser"] {
  return <T>(userId: string, run: (tx: DbExecutor) => Promise<T>): Promise<T> =>
    orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`,
      );
      await tx.execute(sql`SET LOCAL ROLE authenticated`);
      return run(tx as unknown as DbExecutor);
    });
}

/**
 * Base sin políticas: tablas raíz multi-tenant, las funciones helper REALES de
 * 0025 y el DDL adicional que pida el test (tablas y enums suyos). Existe para
 * los tests que necesitan **componer** sus propias policies — el caso canónico es
 * el de escritura de inteligencia, que compara el mismo escenario con y sin la
 * migración que las crea.
 */
export async function createRlsBaseFixture(extraDdl = ""): Promise<RlsFixture> {
  const helpers = helperFunctions();
  if (helpers.length !== 2) {
    throw new Error(`Se esperaban 2 funciones helper en 0025, hay ${helpers.length}`);
  }

  const pg = new PGlite();
  await pg.exec(BASE_TABLES);
  for (const stmt of helpers) await pg.exec(stmt);
  if (extraDdl) await pg.exec(extraDdl);

  const orm = drizzle(pg);
  return { pg, orm, asUser: sessionOf(orm) };
}

/**
 * Levanta un Postgres real con la tabla indicada, sus grants, RLS activado y la
 * policy REAL de la migración 0027 aplicada.
 */
export async function createRlsFixture(table: string, policyName: string): Promise<RlsFixture> {
  const fixture = await createRlsBaseFixture(realTableDdl(table));
  await fixture.pg.exec(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON projects, project_members, "${table}" TO authenticated;`,
  );
  await fixture.pg.exec(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
  await fixture.pg.exec(instantiatePolicy(policyTemplate(), policyName, table));
  return fixture;
}

/**
 * Motivo real de un fallo esperado de Postgres. Drizzle envuelve el error
 * ("Failed query: …") y deja el motivo (policy, permiso, constraint) en `cause`.
 */
export function pgErrorReason(err: unknown): string {
  const cause = (err as { cause?: { message?: string } } | null)?.cause?.message;
  return cause ?? String(err);
}
