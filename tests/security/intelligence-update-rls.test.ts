// @vitest-environment node
/**
 * P0.2 — Escritura (UPDATE) bajo RLS en `intelligence_assets` e
 * `intelligence_findings`, en Postgres real (PGlite).
 *
 * POR QUÉ EXISTE: las dos tablas tenían policies de SELECT (0022) e INSERT
 * (0023) pero **ninguna de UPDATE**, así que el upsert de descubrimiento
 * (`last_seen_at` de un activo ya conocido) y el ciclo de vida de los hallazgos
 * sólo funcionan hoy porque se ejecutan con `directDb` (rol con BYPASSRLS). El
 * día que esos caminos pasen a `withRLS` fallarían, y fallarían **en silencio**:
 * sin policy de UPDATE, RLS esconde la fila y el UPDATE afecta 0 filas sin error.
 * La migración 0046 es el requisito previo de esas dos migraciones de código.
 *
 * El test no imita nada: extrae el `CREATE TYPE`, los `CREATE TABLE` y las
 * policies **reales** de `drizzle/`, y aplica la sesión exactamente como la abre
 * `withRLS()` (ver tests/helpers/pglite-rls.ts).
 *
 * Semántica de RLS que este test fija (y que la intuición suele errar):
 *   - la falta de policy o la falta de acceso **no da error**: filtra filas, y
 *     el UPDATE devuelve 0 filas;
 *   - 42501 sólo aparece cuando la fila **deja de cumplir** el `WITH CHECK`
 *     (moverla a un proyecto ajeno) o cuando falta el **GRANT**.
 *
 * Los escenarios comparten fixture a propósito (levantar un Postgres en proceso
 * cuesta segundos y este archivo prueba tres estados distintos de la tabla), así
 * que **cada caso escribe en su propia fila**: ningún test depende del orden.
 */

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createRlsBaseFixture,
  effectivePolicyDdl,
  migrationStatements,
  pgErrorReason,
  realTableDdl,
  realTypeDdl,
  type RlsFixture,
} from "../helpers/pglite-rls";
// OJO con el orden: se importa el barril de schemas (y no el módulo suelto
// `schemas/intelligence`) porque `intelligence.ts` ↔ `schemas/index.ts` forman
// un ciclo con `adversary.ts` que revienta si se entra por el módulo suelto.
import { intelligenceAssets, intelligenceFindings } from "@/shared/db/schemas";

const MIGRATION = "0046_intelligence_update_policies.sql";
const TABLAS = ["intelligence_assets", "intelligence_findings"];
/**
 * Policies vigentes de las dos tablas: SELECT (0022), INSERT (0023) y UPDATE
 * (0046), con la reescritura owner-only de 0052 ya aplicada. Se toma la última
 * definición de cada nombre en `drizzle/` en vez de replicar 0022/0023, que
 * hacían subquery contra `project_members` (tabla eliminada en 0052).
 */
const POLICIES = effectivePolicyDdl(TABLAS);

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const MEMBER_B = "22222222-2222-2222-2222-222222222222";
const STRANGER_C = "33333333-3333-3333-3333-333333333333";
const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROJECT_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

// Una fila por caso, para poder compartir fixture sin acoplar los tests.
const ASSET_OWNER = "a1000000-0000-4000-8000-0000000000a1";
const FINDING_OWNER = "f1000000-0000-4000-8000-0000000000f1";
const ASSET_MEMBER = "a1000000-0000-4000-8000-0000000000a2";
const FINDING_MEMBER = "f1000000-0000-4000-8000-0000000000f2";
const ASSET_STRANGER = "a1000000-0000-4000-8000-0000000000a3";
const ASSET_MOVE = "a1000000-0000-4000-8000-0000000000a4";
const ASSET_SIN_POLICY = "a1000000-0000-4000-8000-0000000000a5";
const FINDING_SIN_GRANT = "f1000000-0000-4000-8000-0000000000f5";
const ASSET_C = "a1000000-0000-4000-8000-0000000000c1";
const FINDING_C = "f1000000-0000-4000-8000-0000000000c1";

const NEW_SEEN = new Date("2030-01-02T03:04:05.000Z");
const SEED = "2020-01-01T00:00:00.000Z";
const NEW_TITLE = "hallazgo actualizado por su dueño";

/** DDL real de las tablas del dominio (enums incluidos) sacado de las migraciones. */
const TABLES_DDL = [
  realTypeDdl("finding_severity"),
  realTableDdl("intelligence_assets"),
  realTableDdl("intelligence_findings"),
].join(";\n");

/**
 * Escenarios de «readiness» de la tabla:
 *   - `full`        → grants + policies de 0046 (el estado tras la migración);
 *   - `policy-only` → policies de 0046 pero SIN el GRANT UPDATE;
 *   - `none`        → el estado de partida: grants correctos, ninguna policy.
 */
type Escenario = "full" | "policy-only" | "none";

async function buildFixture(escenario: Escenario): Promise<RlsFixture> {
  const fixture = await createRlsBaseFixture(TABLES_DDL);

  const grants = ["SELECT", "INSERT", "DELETE", ...(escenario === "policy-only" ? [] : ["UPDATE"])];
  await fixture.pg.exec(
    `GRANT ${grants.join(", ")} ON projects, ${TABLAS.join(", ")} TO authenticated;`,
  );
  for (const tabla of TABLAS) {
    await fixture.pg.exec(`ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY;`);
  }

  // Policies REALES vigentes: SELECT, INSERT y UPDATE (owner-only desde 0052).
  if (escenario === "policy-only") {
    // Sin la policy de UPDATE: el escenario que mide el GRANT ausente.
    for (const stmt of POLICIES.filter((s) => !/FOR UPDATE/.test(s))) await fixture.pg.exec(stmt);
  } else if (escenario === "full") {
    for (const stmt of POLICIES) await fixture.pg.exec(stmt);
    // La migración entera, sentencia a sentencia (grants incluidos).
    for (const stmt of migrationStatements(MIGRATION)) await fixture.pg.exec(stmt);
  }
  // `none` no aplica ninguna policy: es el escenario que el hallazgo describe.

  // Semilla como superusuario (en producción la hacen los workers con bypass).
  const assets: [string, string, string][] = [
    [ASSET_OWNER, PROJECT_A, "owner.test.local"],
    [ASSET_MEMBER, PROJECT_A, "member.test.local"],
    [ASSET_STRANGER, PROJECT_A, "stranger.test.local"],
    [ASSET_MOVE, PROJECT_A, "move.test.local"],
    [ASSET_SIN_POLICY, PROJECT_A, "sin-policy.test.local"],
    [ASSET_C, PROJECT_C, "c.test.local"],
  ];
  const findings: [string, string, string][] = [
    [FINDING_OWNER, PROJECT_A, "hallazgo del dueño"],
    [FINDING_MEMBER, PROJECT_B, "hallazgo de B"],
    [FINDING_SIN_GRANT, PROJECT_A, "hallazgo sin grant"],
    [FINDING_C, PROJECT_C, "hallazgo de C"],
  ];

  await fixture.pg.exec(`
    INSERT INTO projects (id, owner_id, name, domain) VALUES
      ('${PROJECT_A}', '${OWNER_A}', 'Proyecto de A', 'https://a.test.local'),
      ('${PROJECT_B}', '${MEMBER_B}', 'Proyecto de B', 'https://b.test.local'),
      ('${PROJECT_C}', '${STRANGER_C}', 'Proyecto de C', 'https://c.test.local');
    INSERT INTO intelligence_assets (id, project_id, asset_type, value, last_seen_at) VALUES
      ${assets.map(([id, p, v]) => `('${id}', '${p}', 'domain', '${v}', '${SEED}'::timestamptz)`).join(",\n      ")};
    INSERT INTO intelligence_findings (id, project_id, investigation_id, severity, title, description) VALUES
      ${findings
        .map(
          ([id, p, t]) =>
            `('${id}', '${p}', gen_random_uuid(), 'high', '${t}', 'descripción de ${t}')`,
        )
        .join(",\n      ")};
  `);

  return fixture;
}

/** Un fixture por escenario, levantado a demanda y cerrado al final del archivo. */
const fixtures = new Map<Escenario, RlsFixture>();
async function escenario(e: Escenario): Promise<RlsFixture> {
  const cached = fixtures.get(e);
  if (cached) return cached;
  const built = await buildFixture(e);
  fixtures.set(e, built);
  return built;
}

afterAll(async () => {
  for (const f of fixtures.values()) await f.pg.close();
});

/** Lectura como superusuario: confirma el estado REAL de la fila, no el filtrado. */
async function adminRow(fixture: RlsFixture, sql: string): Promise<Record<string, unknown>> {
  const { rows } = await fixture.pg.query<Record<string, unknown>>(sql);
  return rows[0]!;
}

/**
 * El default del repo son 15s por test (pensado para tests unitarios): levantar
 * un Postgres en proceso y aplicar migraciones reales tarda varios segundos, y
 * más aún con la suite corriendo en paralelo. 60s es margen de arranque, no una
 * concesión de lógica: los asserts siguen siendo estrictos.
 */
describe("P0.2 — UPDATE de inteligencia bajo RLS (Postgres real)", { timeout: 60_000 }, () => {
  it("0046 aplica entera y deja las dos policies de UPDATE activas", async () => {
    const fixture = await escenario("full");

    for (const tabla of TABLAS) {
      const { rows } = await fixture.pg.query<{ policyname: string; cmd: string }>(
        `SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = '${tabla}' ORDER BY policyname`,
      );
      const update = rows.filter((r) => r.cmd === "UPDATE").map((r) => r.policyname);
      expect(update).toEqual([`${tabla}_update_member_or_owner`]);
      // Sigue habiendo exactamente las policies previas + la nueva.
      expect(rows.map((r) => r.policyname).sort()).toEqual(
        [`${tabla}_insert_member_or_owner`, `${tabla}_select_member_or_owner`, `${tabla}_update_member_or_owner`].sort(),
      );
    }
  });

  it("0046 declara 2 GRANT, 2 DROP y 2 CREATE, y el predicado cubre las dos tablas", () => {
    const stmts = migrationStatements(MIGRATION);
    const creates = stmts.filter((s) => /^CREATE POLICY/.test(s));

    expect(stmts.filter((s) => /^GRANT\b/.test(s))).toHaveLength(2);
    expect(stmts.filter((s) => /^DROP POLICY IF EXISTS/.test(s))).toHaveLength(2);
    expect(creates).toHaveLength(2);

    for (const tabla of TABLAS) {
      const c = creates.find((s) => new RegExp(`ON ${tabla}\\b`).test(s));
      expect(c, `falta la policy de UPDATE de ${tabla}`).toBeDefined();
      expect(c).toMatch(/FOR UPDATE TO authenticated/);
      // El predicado debe ser el MISMO helper que usan las policies de SELECT:
      // si divergen, se podría leer una fila y no poder actualizarla.
      expect(c).toMatch(/USING \(public\.user_has_project_access\(project_id\)\)/);
      expect(c).toMatch(/WITH CHECK \(public\.user_has_project_access\(project_id\)\)/);
      // Grant de escritura explícito (0022 sólo declaró SELECT).
      expect(
        stmts.some((s) => new RegExp(`^GRANT INSERT, UPDATE ON ${tabla} TO authenticated;?$`).test(s)),
        `falta el GRANT de escritura de ${tabla}`,
      ).toBe(true);
    }
  });

  it("el dueño actualiza su activo y su hallazgo", async () => {
    const fixture = await escenario("full");

    const assets = await fixture.asUser(OWNER_A, (tx) =>
      tx
        .update(intelligenceAssets)
        .set({ lastSeenAt: NEW_SEEN })
        .where(eq(intelligenceAssets.id, ASSET_OWNER))
        .returning({ id: intelligenceAssets.id }),
    );
    expect(assets).toHaveLength(1);

    const findings = await fixture.asUser(OWNER_A, (tx) =>
      tx
        .update(intelligenceFindings)
        .set({ title: NEW_TITLE })
        .where(eq(intelligenceFindings.id, FINDING_OWNER))
        .returning({ id: intelligenceFindings.id }),
    );
    expect(findings).toHaveLength(1);

    const row = await adminRow(
      fixture,
      `SELECT (SELECT title FROM intelligence_findings WHERE id = '${FINDING_OWNER}') AS title,
              (SELECT last_seen_at >= '${NEW_SEEN.toISOString()}' FROM intelligence_assets WHERE id = '${ASSET_OWNER}') AS seen`,
    );
    expect(row.title).toBe(NEW_TITLE);
    expect(row.seen).toBe(true);
  });

  it("el dueño de otro proyecto actualiza lo suyo y NO lo ajeno (owner-only, P2-16)", async () => {
    const fixture = await escenario("full");

    // Control positivo: B es dueño de su proyecto, así que su propia fila sí se
    // actualiza. Sin esto, el 0 filas de abajo podría deberse a cualquier cosa.
    const own = await fixture.asUser(MEMBER_B, (tx) =>
      tx
        .update(intelligenceFindings)
        .set({ title: "actualizado por el dueño de B" })
        .where(eq(intelligenceFindings.id, FINDING_MEMBER))
        .returning({ id: intelligenceFindings.id }),
    );
    expect(own).toHaveLength(1);

    // El criterio ya no es la membresía (project_members desapareció en 0052):
    // ser dueño de B no da acceso a las filas de A.
    const ajeno = await fixture.asUser(MEMBER_B, (tx) =>
      tx
        .update(intelligenceFindings)
        .set({ title: "intento cross-tenant" })
        .where(eq(intelligenceFindings.id, FINDING_OWNER))
        .returning({ id: intelligenceFindings.id }),
    );
    expect(ajeno).toHaveLength(0);

    const row = await adminRow(fixture, `SELECT title FROM intelligence_findings WHERE id = '${FINDING_OWNER}'`);
    expect(row.title).not.toBe("intento cross-tenant");
  });

  it("un no-miembro no actualiza: 0 filas, sin error y sin cambio", async () => {
    const fixture = await escenario("full");

    // Sin filtro por project_id a propósito: la fila se esconde por RLS, no
    // porque el código se acuerde de filtrar. Ésa es la garantía que se busca.
    const updated = await fixture.asUser(STRANGER_C, (tx) =>
      tx
        .update(intelligenceAssets)
        .set({ lastSeenAt: NEW_SEEN })
        .where(eq(intelligenceAssets.id, ASSET_STRANGER))
        .returning({ id: intelligenceAssets.id }),
    );
    expect(updated).toHaveLength(0);

    const row = await adminRow(
      fixture,
      `SELECT (last_seen_at = '${SEED}'::timestamptz) AS intacto FROM intelligence_assets WHERE id = '${ASSET_STRANGER}'`,
    );
    expect(row.intacto).toBe(true);
  });

  it("el WITH CHECK impide mover una fila a un proyecto ajeno (42501)", async () => {
    const fixture = await escenario("full");

    const err = await fixture
      .asUser(OWNER_A, (tx) =>
        tx
          .update(intelligenceAssets)
          .set({ projectId: PROJECT_C })
          .where(eq(intelligenceAssets.id, ASSET_MOVE))
          .returning({ id: intelligenceAssets.id }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(err, "mover el activo al proyecto de C debía violar el WITH CHECK").not.toBeNull();
    expect(pgErrorReason(err)).toMatch(/row-level security|violates/i);

    const row = await adminRow(fixture, `SELECT project_id FROM intelligence_assets WHERE id = '${ASSET_MOVE}'`);
    expect(row.project_id).toBe(PROJECT_A);
  });

  it("control negativo: sin la migración, ni el dueño actualiza (0 filas en silencio)", async () => {
    const fixture = await escenario("none");

    const updated = await fixture.asUser(OWNER_A, (tx) =>
      tx
        .update(intelligenceAssets)
        .set({ lastSeenAt: NEW_SEEN })
        .where(eq(intelligenceAssets.id, ASSET_SIN_POLICY))
        .returning({ id: intelligenceAssets.id }),
    );

    // Éste es exactamente el síntoma que 0046 corrige: ni excepción ni aviso,
    // sólo un upsert que «no encuentra nada que actualizar».
    expect(updated).toHaveLength(0);
    const row = await adminRow(
      fixture,
      `SELECT (last_seen_at = '${SEED}'::timestamptz) AS intacto FROM intelligence_assets WHERE id = '${ASSET_SIN_POLICY}'`,
    );
    expect(row.intacto).toBe(true);
  });

  it("control negativo: con la policy pero sin el GRANT UPDATE, Postgres niega (42501)", async () => {
    const fixture = await escenario("policy-only");

    const err = await fixture
      .asUser(OWNER_A, (tx) =>
        tx
          .update(intelligenceFindings)
          .set({ title: NEW_TITLE })
          .where(eq(intelligenceFindings.id, FINDING_SIN_GRANT))
          .returning({ id: intelligenceFindings.id }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(err, "sin GRANT UPDATE el UPDATE debía fallar, no devolver 0 filas").not.toBeNull();
    expect(pgErrorReason(err)).toMatch(/permission denied/i);
  });
});
