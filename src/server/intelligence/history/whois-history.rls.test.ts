// @vitest-environment node
/**
 * P0.2-D — Aislamiento multi-tenant del historial WHOIS, en Postgres real (PGlite).
 *
 * Ejecuta el SERVICIO REAL (`queryWhoisHistory`, `getWhoisDomainHistory`,
 * `detectWhoisChanges`) contra un Postgres real con el DDL real de las policies
 * (ver tests/helpers/pglite-rls.ts). El valor está en que el servicio ya no elige
 * con qué autoridad consulta: la recibe del llamante. Si vuelve a importar
 * `directDb`, estos tests dejan de poder pasar filas ajenas… y el de la ruta
 * (route.test.ts) detecta la regresión en el call site.
 */

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRlsFixture,
  fase2Block,
  pgErrorReason,
  policyTemplate,
  type RlsFixture,
} from "../../../../tests/helpers/pglite-rls";
import { whoisHistory } from "@/shared/db/schemas/history";
import type { DbExecutor } from "@/shared/db/executor";
import { queryWhoisHistory, getWhoisDomainHistory, detectWhoisChanges } from "./whois-history";

const RLS_TS = path.join(process.cwd(), "src/shared/db/rls.ts");

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const STRANGER_B = "22222222-2222-2222-2222-222222222222";
const STRANGER_C = "33333333-3333-3333-3333-333333333333";
const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOMAIN = "example.com";

describe("P0.2-D — el historial WHOIS no cruza de tenant (Postgres real)", () => {
  let fixture: RlsFixture;

  beforeAll(async () => {
    fixture = await createRlsFixture("whois_history", "whois_history_fase2");

    // Datos base como postgres (bypassa RLS, igual que el seed y las migraciones).
    await fixture.pg.exec(`
      INSERT INTO projects (id, owner_id, name, domain)
        VALUES ('${PROJECT_A}', '${OWNER_A}', 'Proyecto de A', 'https://a.test.local');
      INSERT INTO whois_history (project_id, domain, registrar, snapshot_hash)
        VALUES ('${PROJECT_A}', '${DOMAIN}', 'ACME Registrar', 'hash-1'),
               ('${PROJECT_A}', '${DOMAIN}', 'ACME Registrar 2', 'hash-2');
    `);
  });

  afterAll(async () => {
    await fixture?.pg.close();
  });

  /** Sesión del usuario indicado sobre el fixture (la abre `createRlsFixture`). */
  function as<T>(userId: string, run: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return fixture.asUser(userId, run);
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
    const result = await as(OWNER_A, (tx) => queryWhoisHistory(tx, { projectId: PROJECT_A }));

    expect(result.totalCount).toBe(2);
    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots[0]!.domain).toBe(DOMAIN);
    expect(result.firstSeen).toBeInstanceOf(Date);
  });

  it("otro usuario NO ve el historial ajeno aunque pida su project_id", async () => {
    const result = await as(STRANGER_B, (tx) => queryWhoisHistory(tx, { projectId: PROJECT_A }));

    // 0 filas, no error: la policy filtra; el servicio ya no decide con qué
    // handle consulta, así que no puede "olvidarse" de la política.
    expect(result.totalCount).toBe(0);
    expect(result.snapshots).toEqual([]);
    expect(result.firstSeen).toBeNull();
  });

  it("otro usuario tampoco ve el historial por dominio (segunda lectura)", async () => {
    const direct = await as(STRANGER_B, (tx) => getWhoisDomainHistory(tx, PROJECT_A, DOMAIN));
    const changes = await as(STRANGER_B, (tx) => detectWhoisChanges(tx, PROJECT_A, DOMAIN));

    expect(direct).toEqual([]);
    expect(changes).toEqual([]);
  });

  it("control positivo: al pasar a ser propietario, el mismo usuario SÍ ve su historial", async () => {
    // Owner-only desde 0052: se traspasa el proyecto, se mide y se devuelve, para
    // que los casos de escritura posteriores sigan midiendo al dueño original.
    await fixture.pg.exec(`UPDATE projects SET owner_id = '${STRANGER_B}' WHERE id = '${PROJECT_A}';`);

    const result = await as(STRANGER_B, (tx) => queryWhoisHistory(tx, { projectId: PROJECT_A }));
    expect(result.totalCount).toBe(2);

    await fixture.pg.exec(`UPDATE projects SET owner_id = '${OWNER_A}' WHERE id = '${PROJECT_A}';`);
  });

  it("un no-miembro no puede escribir historial en el proyecto ajeno (WITH CHECK)", async () => {
    const err = await as(STRANGER_C, (tx) =>
      tx
        .insert(whoisHistory)
        .values({ projectId: PROJECT_A, domain: DOMAIN, snapshotHash: "hash-intruso" }),
    ).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).not.toBeNull();
    expect(pgErrorReason(err)).toMatch(/row-level security|permission denied|violates/i);

    const [{ n }] = (await fixture.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM whois_history WHERE snapshot_hash = 'hash-intruso'`,
    )).rows;
    expect(n).toBe(0);
  });

  it("control positivo de escritura: el dueño sí escribe en su proyecto", async () => {
    await as(OWNER_A, (tx) =>
      tx
        .insert(whoisHistory)
        .values({ projectId: PROJECT_A, domain: DOMAIN, snapshotHash: "hash-propio" }),
    );

    const [{ n }] = (await fixture.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM whois_history WHERE snapshot_hash = 'hash-propio'`,
    )).rows;
    expect(n).toBe(1);
  });
});
