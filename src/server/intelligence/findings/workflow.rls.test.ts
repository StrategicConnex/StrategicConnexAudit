// @vitest-environment node
/**
 * P0.2 — Oleada 2: el ciclo de vida del hallazgo escribe bajo RLS.
 *
 * Ejecuta el SERVICIO REAL (`transitionFinding`, `suppressFinding`,
 * `getFindingScope`) contra un Postgres en proceso con el DDL y las policies
 * REALES de `drizzle/`:
 *   - `intelligence_findings`: SELECT (0022), INSERT (0023) y UPDATE (0046);
 *   - `finding_activity`: su propio DDL, grants y policies
 *     (`2026-10-05_finding_lifecycle.sql`), incluido el `WITH CHECK` que exige
 *     que el actor del historial sea el usuario de la sesión.
 *
 * Lo que se fija aquí es lo que los mocks no pueden probar:
 *   1. Un hallazgo de otro tenant **no existe** para el usuario: la lectura va
 *      por la misma autoridad que la escritura, así que el intento acaba en
 *      `not_found` sin haber tocado la fila.
 *   2. El estado cambia de verdad y deja su rastro en `finding_activity`.
 *   3. Sin la policy de UPDATE de 0046 la ruta seguiría respondiendo `ok`
 *      mientras el estado se queda como estaba: el fallo silencioso que motivó
 *      la migración.
 */

import { afterAll, describe, expect, it } from "vitest";
// El barril de schemas se evalúa PRIMERO para romper el ciclo
// intelligence.ts ↔ schemas/index.ts ↔ adversary.ts (targetTypeEnum).
import "@/shared/db/schemas";
import {
  createRlsBaseFixture,
  effectivePolicyDdl,
  realTableDdl,
  realTypeDdl,
  statementsMatching,
  type RlsFixture,
} from "../../../../tests/helpers/pglite-rls";
import type { DbExecutor } from "@/shared/db/executor";
import { transitionFinding, suppressFinding, getFindingScope } from "./workflow";

const LIFECYCLE_MIGRATION = "2026-10-05_finding_lifecycle.sql";
/**
 * Policies vigentes de `intelligence_findings`: SELECT (0022), INSERT (0023) y
 * UPDATE (0046), con la reescritura owner-only de 0052 ya aplicada.
 */
const POLICIES = effectivePolicyDdl(["intelligence_findings"]);

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const MEMBER_B = "22222222-2222-2222-2222-222222222222";
const STRANGER_C = "33333333-3333-3333-3333-333333333333";
const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROJECT_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/** Una fila por caso: los escenarios comparten fixture, así que no se pisan. */
const F_OWNER = "f1000000-0000-4000-8000-0000000000b1";
const F_MEMBER = "f1000000-0000-4000-8000-0000000000b2";
const F_MEMBER_B = "f1000000-0000-4000-8000-0000000000b6";
const F_STRANGER = "f1000000-0000-4000-8000-0000000000b3";
const F_SUPPRESS = "f1000000-0000-4000-8000-0000000000b4";
const F_NO_POLICY = "f1000000-0000-4000-8000-0000000000b5";

/** `full` → estado tras 0046; `no-update` → el bloqueo de partida. */
type Escenario = "full" | "no-update";

async function buildFixture(escenario: Escenario): Promise<RlsFixture> {
  const fixture = await createRlsBaseFixture(
    [
      realTypeDdl("role"),
      realTableDdl("users"),
      realTypeDdl("finding_severity"),
      realTableDdl("intelligence_findings"),
    ].join(";\n"),
  );

  await fixture.pg.exec(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON projects, users, intelligence_findings TO authenticated;`,
  );
  await fixture.pg.exec(`ALTER TABLE intelligence_findings ENABLE ROW LEVEL SECURITY;`);

  // Policies reales vigentes: SELECT, INSERT y —en `full`— UPDATE. El INSERT de
  // 0023 sólo declara su grant en la tabla del historial, así que el de findings
  // se concede aquí explícitamente (igual que en la base, por DEFAULT PRIVILEGES).
  for (const stmt of POLICIES) {
    if (escenario !== "full" && /FOR UPDATE/.test(stmt)) continue;
    await fixture.pg.exec(stmt);
  }

  // Ciclo de vida COMPLETO, tal como lo escribió su migración: las columnas
  // nuevas de `intelligence_findings` (status, SLA, supresión…) y la tabla del
  // historial con sus grants y policies. Sin las columnas, el UPDATE del estado
  // fallaría por SQL (42703) antes de llegar a la policy.
  for (const stmt of statementsMatching(LIFECYCLE_MIGRATION, /intelligence_findings|finding_activity/)) {
    await fixture.pg.exec(stmt);
  }

  await fixture.pg.exec(`
    INSERT INTO users (id, email, "role") VALUES
      ('${OWNER_A}', 'a@test.local', 'client'),
      ('${MEMBER_B}', 'b@test.local', 'client'),
      ('${STRANGER_C}', 'c@test.local', 'client');
    INSERT INTO projects (id, owner_id, name, domain) VALUES
      ('${PROJECT_A}', '${OWNER_A}', 'Proyecto de A', 'https://a.test.local'),
      ('${PROJECT_B}', '${MEMBER_B}', 'Proyecto de B', 'https://b.test.local'),
      ('${PROJECT_C}', '${STRANGER_C}', 'Proyecto de C', 'https://c.test.local');
    INSERT INTO intelligence_findings (id, project_id, investigation_id, severity, title, description) VALUES
      ('${F_OWNER}', '${PROJECT_A}', gen_random_uuid(), 'critical', 'hallazgo del dueño', 'desc'),
      ('${F_MEMBER}', '${PROJECT_A}', gen_random_uuid(), 'high', 'hallazgo ajeno para B', 'desc'),
      ('${F_MEMBER_B}', '${PROJECT_B}', gen_random_uuid(), 'high', 'hallazgo de B', 'desc'),
      ('${F_STRANGER}', '${PROJECT_A}', gen_random_uuid(), 'high', 'hallazgo al que C no llega', 'desc'),
      ('${F_SUPPRESS}', '${PROJECT_A}', gen_random_uuid(), 'medium', 'hallazgo a silenciar', 'desc'),
      ('${F_NO_POLICY}', '${PROJECT_A}', gen_random_uuid(), 'medium', 'hallazgo sin policy de UPDATE', 'desc'),
      (gen_random_uuid(), '${PROJECT_C}', gen_random_uuid(), 'low', 'hallazgo de C', 'desc');
  `);

  return fixture;
}

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

async function adminRow(fixture: RlsFixture, sql: string): Promise<Record<string, unknown>> {
  const { rows } = await fixture.pg.query<Record<string, unknown>>(sql);
  return rows[0]!;
}

const statusOf = (fixture: RlsFixture, id: string) =>
  adminRow(fixture, `SELECT status FROM intelligence_findings WHERE id = '${id}'`).then((r) => r.status);

const activityOf = (fixture: RlsFixture, id: string) =>
  adminRow(fixture, `SELECT count(*)::int AS n FROM finding_activity WHERE finding_id = '${id}'`).then(
    (r) => r.n,
  );

function as<T>(fixture: RlsFixture, userId: string, run: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return fixture.asUser(userId, run);
}

describe("P0.2 Oleada 2 — ciclo de vida del hallazgo bajo RLS", { timeout: 60_000 }, () => {
  it("el dueño acusa recibo: cambia el estado, fija el SLA y deja historial", async () => {
    const fixture = await escenario("full");

    const result = await as(fixture, OWNER_A, (tx) =>
      transitionFinding(tx, {
        findingId: F_OWNER,
        toStatus: "acknowledged",
        actorId: OWNER_A,
        note: "visto",
      }),
    );

    expect(result.ok).toBe(true);
    expect(await statusOf(fixture, F_OWNER)).toBe("acknowledged");
    expect(await activityOf(fixture, F_OWNER)).toBe(1);

    const row = await adminRow(
      fixture,
      `SELECT (due_at IS NOT NULL) AS con_sla, sla_hours FROM intelligence_findings WHERE id = '${F_OWNER}'`,
    );
    expect(row.con_sla).toBe(true);
    // critical → 24h por defecto.
    expect(row.sla_hours).toBe(24);
  });

  it("el dueño de OTRO proyecto no transiciona el hallazgo ajeno (owner-only, P2-16)", async () => {
    const fixture = await escenario("full");

    // Control positivo primero: B sí transiciona lo suyo (es dueño de PROJECT_B).
    const propio = await as(fixture, MEMBER_B, (tx) =>
      transitionFinding(tx, {
        findingId: F_MEMBER_B,
        toStatus: "acknowledged",
        actorId: MEMBER_B,
      }),
    );
    expect(propio.ok).toBe(true);
    expect(await statusOf(fixture, F_MEMBER_B)).toBe("acknowledged");

    // Y no lo ajeno: `project_members` desapareció en 0052, así que ser dueño de
    // otro proyecto no da acceso — la fila ni se ve.
    const ajeno = await as(fixture, MEMBER_B, (tx) =>
      transitionFinding(tx, {
        findingId: F_MEMBER,
        toStatus: "acknowledged",
        actorId: MEMBER_B,
      }),
    );
    expect(ajeno.ok).toBe(false);
    expect(await statusOf(fixture, F_MEMBER)).toBe("open");
  });

  it("un no-miembro ni siquiera ve el hallazgo: not_found y nada escrito", async () => {
    const fixture = await escenario("full");

    const scope = await as(fixture, STRANGER_C, (tx) => getFindingScope(tx, F_STRANGER));
    const result = await as(fixture, STRANGER_C, (tx) =>
      transitionFinding(tx, {
        findingId: F_STRANGER,
        toStatus: "acknowledged",
        actorId: STRANGER_C,
      }),
    );

    // La lectura va por la misma autoridad que la escritura: la fila ajena no
    // existe para C, así que ni se intenta el UPDATE (y no hay forma de deducir
    // desde la respuesta que el id existe en otro tenant).
    expect(scope).toBeNull();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
    expect(await statusOf(fixture, F_STRANGER)).toBe("open");
    expect(await activityOf(fixture, F_STRANGER)).toBe(0);
  });

  it("silenciar: el dueño puede, el de otro tenant ni lo ve", async () => {
    const fixture = await escenario("full");

    const ok = await as(fixture, OWNER_A, (tx) =>
      suppressFinding(tx, {
        findingId: F_SUPPRESS,
        actorId: OWNER_A,
        reason: "ruido conocido",
        hours: 48,
      }),
    );
    expect(ok.ok).toBe(true);

    const ajeno = await as(fixture, STRANGER_C, (tx) =>
      suppressFinding(tx, {
        findingId: F_SUPPRESS,
        actorId: STRANGER_C,
        reason: "intento ajeno",
        hours: 48,
      }),
    );
    expect(ajeno).toEqual({ ok: false, suppressedUntil: null });

    const row = await adminRow(
      fixture,
      `SELECT suppressed_reason FROM intelligence_findings WHERE id = '${F_SUPPRESS}'`,
    );
    expect(row.suppressed_reason).toBe("ruido conocido");
  });

  it("control negativo: sin la policy de UPDATE el estado no cambia y el historial miente", async () => {
    const fixture = await escenario("no-update");

    const result = await as(fixture, OWNER_A, (tx) =>
      transitionFinding(tx, {
        findingId: F_NO_POLICY,
        toStatus: "acknowledged",
        actorId: OWNER_A,
      }),
    );

    // La lectura funcionaba (la policy de SELECT es de 0022) y por eso el
    // servicio responde `ok`; pero sin policy de UPDATE la sentencia no
    // encuentra fila que actualizar y **no da error**, así que:
    //   - el estado del hallazgo se queda en 'open';
    //   - y el historial SÍ registra una transición que nunca ocurrió (su
    //     INSERT tiene policy propia y no depende del UPDATE).
    // Respuesta `ok` + estado intacto + rastro falso es el síntoma exacto que
    // obligó a escribir 0046: nada de esto era visible sin mirar la tabla.
    expect(result.ok).toBe(true);
    expect(await statusOf(fixture, F_NO_POLICY)).toBe("open");
    expect(await activityOf(fixture, F_NO_POLICY)).toBe(1);
  });
});
