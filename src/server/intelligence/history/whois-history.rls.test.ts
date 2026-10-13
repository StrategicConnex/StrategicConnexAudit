// @vitest-environment node
/**
 * P0.2-D — Aislamiento multi-tenant del historial WHOIS, en Postgres real
 * (PGlite: Postgres compilado a WASM, en proceso).
 *
 * QUÉ PRUEBA (y por qué así): el servicio `queryWhoisHistory()`/`detectWhoisChanges()`
 * dejó de importar `directDb` y ahora recibe el manejador de BD del llamante. Eso
 * solo vale si la autoridad que recibe por el camino de sesión es la que aplica
 * las policies. Aquí se ejecuta el SERVICIO REAL contra un Postgres real usando:
 *   - el DDL REAL de las policies de `whois_history` (plantilla `FOR ALL …` del
 *     bloque de la migración 0027, instanciada para la tabla y verificada contra
 *     el propio listado de tablas de la migración);
 *   - las funciones REALES `public.current_auth_uid()` y
 *     `public.user_has_project_access()` (migración 0025);
 *   - la tabla REAL `whois_history` (migración 0010);
 *   - la misma apertura de sesión que `withRLS()` en producción
 *     (`set_config('request.jwt.claims', …, true)` + `SET LOCAL ROLE authenticated`).
 *
 * ALCANCE / SUPUESTO DOCUMENTADO: el fixture concede los privilegios de tabla
 * (`GRANT SELECT, INSERT, UPDATE, DELETE ON whois_history TO authenticated`) de
 * forma explícita. En la base live esos grants vienen de los DEFAULT PRIVILEGES de
 * Supabase (por eso 0042 tuvo que REVOKE TRUNCATE a mano). Es decir: este test
 * verifica la POLICY (aislamiento), no el estado real de los grants — eso lo
 * comprueba el job de CI que sí tiene `DIRECT_URL`.
 */

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { ROOT, splitStatements } from "../../../../scripts/db/rls-inventory.mjs";
import { whoisHistory } from "@/shared/db/schemas/history";
import { queryWhoisHistory, getWhoisDomainHistory, detectWhoisChanges } from "./whois-history";
import type { DbExecutor } from "@/shared/db/executor";

const MIGRATION_CORE = path.join(ROOT, "drizzle/0025_rls_core_defense_in_depth.sql");
const MIGRATION_TABLE = path.join(ROOT, "drizzle/0010_dns_whois_history.sql");
const MIGRATION_FASE2 = path.join(ROOT, "drizzle/0027_rls_fase2.sql");
const RLS_TS = path.join(ROOT, "src/shared/db/rls.ts");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const STRANGER_B = "22222222-2222-2222-2222-222222222222";
const STRANGER_C = "33333333-3333-3333-3333-333333333333";
const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOMAIN = "example.com";

/** Funciones helper reales de la migración 0025 (las usa la policy de 0027). */
function helperFunctions(): string[] {
  return splitStatements(fs.readFileSync(MIGRATION_CORE, "utf8")).filter((s) =>
    /FUNCTION public\.(current_auth_uid|user_has_project_access)\b/.test(s),
  );
}

/** `CREATE TABLE … "whois_history" …` real de la migración 0010. */
function realWhoisTable(): string {
  const [ddl] = splitStatements(fs.readFileSync(MIGRATION_TABLE, "utf8")).filter((s) =>
    /CREATE TABLE (IF NOT EXISTS )?"whois_history"/.test(s),
  );
  if (!ddl) throw new Error("No se encontró el CREATE TABLE de whois_history en 0010");
  return ddl;
}

/** Bloque dinámico de 0027 que crea las policies fase 2 (plantilla + listado). */
function fase2Block(): string {
  const [block] = splitStatements(fs.readFileSync(MIGRATION_FASE2, "utf8")).filter((s) =>
    /FOREACH t IN ARRAY tables LOOP/.test(s),
  );
  if (!block) throw new Error("No se encontró el bloque de policies fase 2 en 0027");
  return block;
}

/** Plantilla `CREATE POLICY %I ON %I FOR ALL TO authenticated …` de ese bloque. */
function policyTemplate(): string {
  const [template] = [...fase2Block().matchAll(/'CREATE POLICY [^']*'/g)].map((m) =>
    m[0].slice(1, -1),
  );
  if (!template) throw new Error("No se encontró la plantilla CREATE POLICY en 0027");
  return template;
}

/** Instancia la plantilla de la migración con nombre de policy y tabla concretos. */
function instantiatePolicy(template: string, policyName: string, table: string): string {
  const idents = [`"${policyName}"`, `"${table}"`];
  let i = 0;
  return template.replace(/%I/g, () => idents[i++] ?? "");
}

/** Forma de tabla del fixture (los grants replican los DEFAULT PRIVILEGES de Supabase). */
const FIXTURE = `
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
  GRANT SELECT, INSERT, UPDATE, DELETE ON projects, project_members, whois_history TO authenticated;
`;

describe("P0.2-D — el historial WHOIS no cruza de tenant (Postgres real)", () => {
  // PGlite no expone tipos exactos de drizzle; el servicio solo usa el handle.
  let pg: PGlite;
  let orm: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const ddl = helperFunctions();
    expect(ddl).toHaveLength(2); // current_auth_uid + user_has_project_access

    pg = new PGlite();
    await pg.exec(realWhoisTable());
    await pg.exec(FIXTURE);
    for (const stmt of ddl) await pg.exec(stmt);
    await pg.exec(`ALTER TABLE whois_history ENABLE ROW LEVEL SECURITY`);
    await pg.exec(
      instantiatePolicy(policyTemplate(), "whois_history_fase2", "whois_history"),
    );

    orm = drizzle(pg);

    // Datos base como postgres (bypassa RLS, igual que el seed y las migraciones).
    await pg.exec(`
      INSERT INTO projects (id, owner_id, name, domain)
        VALUES ('${PROJECT_A}', '${OWNER_A}', 'Proyecto de A', 'https://a.test.local');
      INSERT INTO whois_history (project_id, domain, registrar, snapshot_hash)
        VALUES ('${PROJECT_A}', '${DOMAIN}', 'ACME Registrar', 'hash-1'),
               ('${PROJECT_A}', '${DOMAIN}', 'ACME Registrar 2', 'hash-2');
    `);
  });

  afterAll(async () => {
    await pg?.close();
  });

  /** Abre la sesión exactamente como `withRLS()`: claims + SET LOCAL ROLE. */
  async function asUser<T>(userId: string, run: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`,
      );
      await tx.execute(sql`SET LOCAL ROLE authenticated`);
      return run(tx as unknown as DbExecutor);
    });
  }

  it("usa el DDL real: la plantilla de 0027 cubre whois_history", () => {
    expect(fase2Block()).toMatch(/'whois_history'/);
    expect(policyTemplate()).toBe(
      "CREATE POLICY %I ON %I FOR ALL TO authenticated USING (public.user_has_project_access(project_id)) WITH CHECK (public.user_has_project_access(project_id))",
    );
  });

  it("la emulación de sesión coincide con withRLS() de producción", () => {
    const src = fs.readFileSync(RLS_TS, "utf8");
    expect(src).toMatch(/set_config\('request\.jwt\.claims'/);
    expect(src).toMatch(/SET LOCAL ROLE authenticated/);
  });

  it("el dueño lee su propio historial (control positivo)", async () => {
    const result = await asUser(OWNER_A, (tx) => queryWhoisHistory(tx, { projectId: PROJECT_A }));

    expect(result.totalCount).toBe(2);
    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots[0]!.domain).toBe(DOMAIN);
    expect(result.firstSeen).toBeInstanceOf(Date);
  });

  it("otro usuario NO ve el historial ajeno aunque pida su project_id", async () => {
    const result = await asUser(STRANGER_B, (tx) =>
      queryWhoisHistory(tx, { projectId: PROJECT_A }),
    );

    // 0 filas, no error: la policy filtra; el servicio no puede "recordar" leer
    // sin política porque ya no decide él con qué handle consulta.
    expect(result.totalCount).toBe(0);
    expect(result.snapshots).toEqual([]);
    expect(result.firstSeen).toBeNull();
  });

  it("otro usuario tampoco ve el historial por dominio (segunda lectura)", async () => {
    const direct = await asUser(STRANGER_B, (tx) =>
      getWhoisDomainHistory(tx, PROJECT_A, DOMAIN),
    );
    const changes = await asUser(STRANGER_B, (tx) => detectWhoisChanges(tx, PROJECT_A, DOMAIN));

    expect(direct).toEqual([]);
    expect(changes).toEqual([]);
  });

  it("control positivo: al ser miembro, el mismo usuario SÍ ve el historial", async () => {
    await pg.exec(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ('${PROJECT_A}', '${STRANGER_B}', 'viewer');`,
    );

    const result = await asUser(STRANGER_B, (tx) =>
      queryWhoisHistory(tx, { projectId: PROJECT_A }),
    );
    expect(result.totalCount).toBe(2);
  });

  it("un no-miembro no puede escribir historial en el proyecto ajeno (WITH CHECK)", async () => {
    // Drizzle envuelve el error de Postgres ("Failed query: …") y deja el motivo
    // real en `cause`: se comprueba el motivo, no el envoltorio.
    const err = await asUser(STRANGER_C, (tx) =>
      tx
        .insert(whoisHistory)
        .values({ projectId: PROJECT_A, domain: DOMAIN, snapshotHash: "hash-intruso" }),
    ).then(
      () => null,
      (e: unknown) => e as { cause?: { message?: string } },
    );

    expect(err).not.toBeNull();
    expect(err?.cause?.message ?? String(err)).toMatch(
      /row-level security|permission denied|violates/i,
    );

    const [{ n }] = (await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM whois_history WHERE snapshot_hash = 'hash-intruso'`,
    )).rows;
    expect(n).toBe(0);
  });

  it("control positivo de escritura: el dueño sí escribe en su proyecto", async () => {
    await asUser(OWNER_A, (tx) =>
      tx
        .insert(whoisHistory)
        .values({ projectId: PROJECT_A, domain: DOMAIN, snapshotHash: "hash-propio" }),
    );

    const [{ n }] = (await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM whois_history WHERE snapshot_hash = 'hash-propio'`,
    )).rows;
    expect(n).toBe(1);
  });
});
