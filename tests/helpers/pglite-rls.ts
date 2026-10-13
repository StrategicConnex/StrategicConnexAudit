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
 *   - tabla: su `CREATE TABLE` real (hoy 0010 para el historial);
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

const MIGRATION_CORE = path.join(ROOT, "drizzle/0025_rls_core_defense_in_depth.sql");
const MIGRATION_TABLES = path.join(ROOT, "drizzle/0010_dns_whois_history.sql");
const MIGRATION_FASE2 = path.join(ROOT, "drizzle/0027_rls_fase2.sql");

/** Handle de drizzle sobre PGlite (el fixture solo lo usa para abrir sesión). */
export type RlsOrm = ReturnType<typeof drizzle>;

/** Funciones helper reales de la migración 0025, usadas por las policies. */
export function helperFunctions(): string[] {
  return (splitStatements(fs.readFileSync(MIGRATION_CORE, "utf8")) as string[]).filter((s) =>
    /FUNCTION public\.(current_auth_uid|user_has_project_access)\b/.test(s),
  );
}

/** `CREATE TABLE … "<table>" …` real, tal como lo escribió su migración. */
export function realTableDdl(table: string): string {
  const [ddl] = (splitStatements(fs.readFileSync(MIGRATION_TABLES, "utf8")) as string[]).filter(
    (s) => new RegExp(`^CREATE TABLE (IF NOT EXISTS )?"${table}"`).test(s),
  );
  if (!ddl) throw new Error(`No se encontró el CREATE TABLE de ${table} en 0010`);
  return ddl;
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

/**
 * Levanta un Postgres real con la tabla indicada, sus grants, RLS activado y la
 * policy REAL de la migración 0027 aplicada.
 */
export async function createRlsFixture(table: string, policyName: string): Promise<RlsFixture> {
  const helpers = helperFunctions();
  if (helpers.length !== 2) {
    throw new Error(`Se esperaban 2 funciones helper en 0025, hay ${helpers.length}`);
  }

  const pg = new PGlite();
  await pg.exec(realTableDdl(table));
  await pg.exec(BASE_TABLES);
  await pg.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON projects, project_members, "${table}" TO authenticated;`);
  for (const stmt of helpers) await pg.exec(stmt);
  await pg.exec(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
  await pg.exec(instantiatePolicy(policyTemplate(), policyName, table));

  const orm = drizzle(pg);

  return {
    pg,
    orm,
    async asUser<T>(userId: string, run: (tx: DbExecutor) => Promise<T>): Promise<T> {
      return orm.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`,
        );
        await tx.execute(sql`SET LOCAL ROLE authenticated`);
        return run(tx as unknown as DbExecutor);
      });
    },
  };
}

/**
 * Motivo real de un fallo esperado de Postgres. Drizzle envuelve el error
 * ("Failed query: …") y deja el motivo (policy, permiso, constraint) en `cause`.
 */
export function pgErrorReason(err: unknown): string {
  const cause = (err as { cause?: { message?: string } } | null)?.cause?.message;
  return cause ?? String(err);
}
