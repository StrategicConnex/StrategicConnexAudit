// @vitest-environment node
/**
 * P0.2 — Oleada 2: la persistencia del descubrimiento escribe bajo RLS.
 *
 * Ejecuta `persistDiscovery()` —el servicio real— contra un Postgres en proceso
 * (PGlite) con el DDL y las policies REALES de `drizzle/`: SELECT (0022), INSERT
 * (0023) y UPDATE (0046) de `intelligence_assets`. El valor del test está en dos
 * cosas que ningún mock puede probar:
 *
 *   1. El upsert de activos (`onConflictDoUpdate`) refresca `last_seen_at` de un
 *      activo ya conocido: es JUSTAMENTE lo que desbloqueó 0046. Sin la policy de
 *      UPDATE, ese refresco no ocurre aunque la lectura funcione.
 *   2. El alcance lo decide la autoridad del llamante: con la sesión de otro
 *      tenant no se escribe (no es que el código se olvide de comprobar, es que
 *      Postgres no deja).
 *
 * La fase de RED (`discoverAssets`) no se prueba aquí: no toca la base. Se le
 * pasa a `persistDiscovery` su resultado simulado, que es la frontera real entre
 * las dos fases.
 */

import { afterAll, describe, expect, it } from "vitest";
// El barril de schemas se evalúa PRIMERO para romper el ciclo
// intelligence.ts ↔ schemas/index.ts ↔ adversary.ts (targetTypeEnum).
import "@/shared/db/schemas";
import {
  createRlsBaseFixture,
  pgErrorReason,
  realTableDdl,
  statementsMatching,
  type RlsFixture,
} from "../../../../tests/helpers/pglite-rls";
import type { DbExecutor } from "@/shared/db/executor";
import type { DiscoveryModuleResult } from "./types";
import { persistDiscovery } from "./orchestrator";

const UPDATE_MIGRATION = "0046_intelligence_update_policies.sql";
const PREVIAS = ["0022_rls_intelligence_realtime.sql", "0023_rls_write_policies.sql"];
const POLICY_RE = /^CREATE POLICY .* ON intelligence_assets\b/;

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const MEMBER_B = "22222222-2222-2222-2222-222222222222";
const STRANGER_C = "33333333-3333-3333-3333-333333333333";
const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const DOMAIN = "example.com";
const SEED = "2020-01-01T00:00:00.000Z";

/** Un módulo con los activos indicados; el resto de campos no influye aquí. */
function modulesWith(assets: Array<{ assetType: string; value: string; ip?: string | null }>): DiscoveryModuleResult[] {
  return [
    {
      moduleId: "dns-brute",
      moduleName: "DNS Brute Force",
      assets: assets.map((a) => ({
        assetType: a.assetType,
        value: a.value,
        ip: a.ip ?? null,
        metadata: { source: "test" },
      })),
      findings: [],
      success: true,
      durationMs: 1,
    },
  ];
}

/**
 * `full`      → estado tras 0046 (SELECT + INSERT + UPDATE).
 * `no-update` → el estado de partida: se puede leer e insertar, pero no refrescar.
 */
type Escenario = "full" | "no-update";

async function buildFixture(escenario: Escenario): Promise<RlsFixture> {
  const fixture = await createRlsBaseFixture(realTableDdl("intelligence_assets"));

  await fixture.pg.exec(
    `GRANT SELECT, INSERT, DELETE, UPDATE ON projects, project_members, intelligence_assets TO authenticated;`,
  );
  await fixture.pg.exec(`ALTER TABLE intelligence_assets ENABLE ROW LEVEL SECURITY;`);

  for (const file of PREVIAS) {
    for (const stmt of statementsMatching(file, POLICY_RE)) await fixture.pg.exec(stmt);
  }
  if (escenario === "full") {
    // Solo la policy de `intelligence_assets`: la otra mitad de 0046 es de
    // `intelligence_findings`, que no forma parte de este fixture.
    for (const stmt of statementsMatching(UPDATE_MIGRATION, POLICY_RE)) {
      await fixture.pg.exec(stmt);
    }
  }

  await fixture.pg.exec(`
    INSERT INTO projects (id, owner_id, name, domain) VALUES
      ('${PROJECT_A}', '${OWNER_A}', 'Proyecto de A', 'https://a.test.local'),
      ('${PROJECT_C}', '${STRANGER_C}', 'Proyecto de C', 'https://c.test.local');
    INSERT INTO project_members (project_id, user_id, role) VALUES
      ('${PROJECT_A}', '${MEMBER_B}', 'viewer');
    INSERT INTO intelligence_assets (id, project_id, asset_type, value, last_seen_at) VALUES
      (gen_random_uuid(), '${PROJECT_A}', 'subdomain', 'conocido.example.com', '${SEED}'::timestamptz),
      (gen_random_uuid(), '${PROJECT_C}', 'subdomain', 'otro.example.com', '${SEED}'::timestamptz);
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

/** Lectura como superusuario: el estado REAL de la tabla, sin filtro de policy. */
async function adminRow(fixture: RlsFixture, sql: string): Promise<Record<string, unknown>> {
  const { rows } = await fixture.pg.query<Record<string, unknown>>(sql);
  return rows[0]!;
}

function as<T>(fixture: RlsFixture, userId: string, run: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return fixture.asUser(userId, run);
}

describe("P0.2 Oleada 2 — persistencia del descubrimiento bajo RLS", { timeout: 60_000 }, () => {
  it("el dueño registra un activo nuevo", async () => {
    const fixture = await escenario("full");

    const result = await as(fixture, OWNER_A, (tx) =>
      persistDiscovery(tx, {
        projectId: PROJECT_A,
        domain: DOMAIN,
        modules: modulesWith([{ assetType: "subdomain", value: "nuevo.example.com", ip: "1.1.1.1" }]),
      }),
    );

    expect(result.totalNewAssets).toBe(1);
    const row = await adminRow(
      fixture,
      `SELECT count(*)::int AS n FROM intelligence_assets
        WHERE project_id = '${PROJECT_A}' AND value = 'nuevo.example.com'`,
    );
    expect(row.n).toBe(1);
  });

  it("el dueño refresca un activo ya conocido (el UPDATE que estrena 0046)", async () => {
    const fixture = await escenario("full");

    const result = await as(fixture, OWNER_A, (tx) =>
      persistDiscovery(tx, {
        projectId: PROJECT_A,
        domain: DOMAIN,
        modules: modulesWith([{ assetType: "subdomain", value: "conocido.example.com" }]),
      }),
    );

    expect(result.totalNewAssets).toBe(0);
    const row = await adminRow(
      fixture,
      `SELECT (last_seen_at > '${SEED}'::timestamptz) AS refrescado FROM intelligence_assets
        WHERE project_id = '${PROJECT_A}' AND value = 'conocido.example.com'`,
    );
    expect(row.refrescado).toBe(true);
  });

  it("un miembro no propietario también persiste (el criterio es la membresía)", async () => {
    const fixture = await escenario("full");

    const result = await as(fixture, MEMBER_B, (tx) =>
      persistDiscovery(tx, {
        projectId: PROJECT_A,
        domain: DOMAIN,
        modules: modulesWith([{ assetType: "certificate", value: "SHA256:aa..." }]),
      }),
    );

    expect(result.totalNewAssets).toBe(1);
    const row = await adminRow(
      fixture,
      `SELECT count(*)::int AS n FROM intelligence_assets
        WHERE project_id = '${PROJECT_A}' AND asset_type = 'certificate'`,
    );
    expect(row.n).toBe(1);
  });

  it("un no-miembro no puede escribir en el proyecto ajeno (WITH CHECK)", async () => {
    const fixture = await escenario("full");

    const err = await as(fixture, STRANGER_C, (tx) =>
      persistDiscovery(tx, {
        projectId: PROJECT_A,
        domain: DOMAIN,
        modules: modulesWith([{ assetType: "subdomain", value: "intruso.example.com" }]),
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );

    // Con el proyecto ajeno no hay 0 filas silenciosas: el INSERT choca con el
    // WITH CHECK de la policy y Postgres lo rechaza.
    expect(err, "escribir en el proyecto de A debía violar la policy").not.toBeNull();
    expect(pgErrorReason(err)).toMatch(/row-level security|violates/i);

    const row = await adminRow(
      fixture,
      `SELECT count(*)::int AS n FROM intelligence_assets WHERE value IN ('intruso.example.com')`,
    );
    expect(row.n).toBe(0);
  });

  it("control negativo: en el escenario sin 0046 se puede insertar pero NO refrescar", async () => {
    const fixture = await escenario("no-update");

    // (a) Insertar un activo NUEVO sí funciona: SELECT e INSERT tienen su policy.
    const inserted = await as(fixture, OWNER_A, (tx) =>
      persistDiscovery(tx, {
        projectId: PROJECT_A,
        domain: DOMAIN,
        modules: modulesWith([{ assetType: "subdomain", value: "sin-policy.example.com" }]),
      }),
    );
    expect(inserted.totalNewAssets).toBe(1);

    // (b) Refrescar uno CONOCIDO no: es un UPDATE, y sin la policy de 0046
    // Postgres no ve la fila que debe actualizar. Lo importante es CÓMO falla:
    // sin excepción y sin aviso, el activo se queda con su `last_seen_at` viejo
    // —el bloqueo silencioso que quitó 0046 de en medio, y la razón de que no se
    // detectara antes—.
    const result = await as(fixture, OWNER_A, (tx) =>
      persistDiscovery(tx, {
        projectId: PROJECT_A,
        domain: DOMAIN,
        modules: modulesWith([{ assetType: "subdomain", value: "conocido.example.com" }]),
      }),
    );
    expect(result).toEqual({ totalNewAssets: 0, totalChanges: 0 });

    const row = await adminRow(
      fixture,
      `SELECT (last_seen_at = '${SEED}'::timestamptz) AS intacto FROM intelligence_assets
        WHERE project_id = '${PROJECT_A}' AND value = 'conocido.example.com'`,
    );
    expect(row.intacto).toBe(true);
  });
});
