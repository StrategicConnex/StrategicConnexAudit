// @vitest-environment node
/**
 * P0.2-D (2ª migración) — Aislamiento multi-tenant del historial DNS, en Postgres
 * real (PGlite).
 *
 * Mismo contrato que el test del historial WHOIS, ahora para `queryDnsHistory()`
 * y `detectDnsChanges()`: el servicio recibe el manejador de BD del llamante, así
 * que con la sesión de otro tenant no ve sus filas. La ESCRITURA del servicio
 * (`persistDnsSnapshot`) sigue en `directDb` —la invocan executors
 * fire-and-forget— y por eso la cobertura de policy se comprueba a nivel de tabla:
 * deja documentado que el día que la transacción se propague, la policy ya está.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRlsFixture,
  fase2Block,
  pgErrorReason,
  policyTemplate,
  type RlsFixture,
} from "../../../../tests/helpers/pglite-rls";
import { dnsHistory } from "@/shared/db/schemas/history";
import type { DbExecutor } from "@/shared/db/executor";
import { queryDnsHistory, detectDnsChanges } from "./dns-history";

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const STRANGER_B = "22222222-2222-2222-2222-222222222222";
const STRANGER_C = "33333333-3333-3333-3333-333333333333";
const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOMAIN = "example.com";

describe("P0.2-D — el historial DNS no cruza de tenant (Postgres real)", () => {
  let fixture: RlsFixture;

  beforeAll(async () => {
    fixture = await createRlsFixture("dns_history", "dns_history_fase2");

    // Dos resoluciones del MISMO registro A con valor distinto y fechas explícitas
    // (detectDnsChanges ordena por snapshot_date y compara las dos últimas).
    await fixture.pg.exec(`
      INSERT INTO projects (id, owner_id, name, domain)
        VALUES ('${PROJECT_A}', '${OWNER_A}', 'Proyecto de A', 'https://a.test.local');
      INSERT INTO dns_history (project_id, record_type, query, value, snapshot_hash, snapshot_date, first_seen_at)
        VALUES ('${PROJECT_A}', 'A', '${DOMAIN}', '1.1.1.1', 'dns-h1', now() - interval '2 hours', now() - interval '2 hours'),
               ('${PROJECT_A}', 'A', '${DOMAIN}', '2.2.2.2', 'dns-h2', now(), now() - interval '2 hours');
    `);
  });

  afterAll(async () => {
    await fixture?.pg.close();
  });

  /** Sesión del usuario indicado sobre el fixture (la abre `createRlsFixture`). */
  function as<T>(userId: string, run: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return fixture.asUser(userId, run);
  }

  it("usa el DDL real: la plantilla de 0027 cubre dns_history", () => {
    expect(fase2Block()).toMatch(/'dns_history'/);
    expect(policyTemplate()).toContain("FOR ALL TO authenticated");
  });

  it("el dueño lee su propio historial DNS y ve el cambio (control positivo)", async () => {
    const result = await as(OWNER_A, (tx) =>
      queryDnsHistory(tx, { projectId: PROJECT_A, recordType: "A" }),
    );
    expect(result.totalCount).toBe(2);
    expect(result.snapshots.map((s) => s.value)).toEqual(["2.2.2.2", "1.1.1.1"]);
    expect(result.firstSeen).toBeInstanceOf(Date);

    const changes = await as(OWNER_A, (tx) => detectDnsChanges(tx, PROJECT_A, DOMAIN));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: "changed",
      recordType: "A",
      previousValue: "1.1.1.1",
      currentValue: "2.2.2.2",
    });
  });

  it("otro usuario NO ve el historial DNS ajeno aunque pida su project_id", async () => {
    const result = await as(STRANGER_B, (tx) =>
      queryDnsHistory(tx, { projectId: PROJECT_A }),
    );

    // 0 filas, no error: filtra la policy, no el servicio.
    expect(result.totalCount).toBe(0);
    expect(result.snapshots).toEqual([]);
    expect(result.firstSeen).toBeNull();
    expect(result.lastSeen).toBeNull();
  });

  it("otro usuario tampoco deduce cambios DNS del tenant ajeno (segunda lectura)", async () => {
    const changes = await as(STRANGER_B, (tx) => detectDnsChanges(tx, PROJECT_A, DOMAIN));
    expect(changes).toEqual([]);
  });

  it("control positivo: al pasar a ser propietario, el mismo usuario SÍ ve el historial DNS", async () => {
    // project_members desapareció en 0052 (owner-only): el único modo de que el
    // usuario B acceda es la propiedad. Se traspasa y se devuelve al final, para
    // que los casos de escritura de más abajo sigan midiendo al dueño original.
    await fixture.pg.exec(
      `UPDATE projects SET owner_id = '${STRANGER_B}' WHERE id = '${PROJECT_A}';`,
    );

    const result = await as(STRANGER_B, (tx) => queryDnsHistory(tx, { projectId: PROJECT_A }));
    expect(result.totalCount).toBe(2);

    await fixture.pg.exec(`UPDATE projects SET owner_id = '${OWNER_A}' WHERE id = '${PROJECT_A}';`);
  });

  it("la policy ya cubre la escritura: un no-miembro no puede insertar en el proyecto ajeno", async () => {
    // La escritura del servicio sigue en directDb (executors sin sesión). Este
    // caso fija que, cuando se propague la transacción, la policy WITH CHECK
    // rechace el mismo INSERT que hoy intentaría el camino migrado.
    const err = await as(STRANGER_C, (tx) =>
      tx.insert(dnsHistory).values({
        projectId: PROJECT_A,
        recordType: "A",
        query: DOMAIN,
        value: "9.9.9.9",
        snapshotHash: "dns-intruso",
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).not.toBeNull();
    expect(pgErrorReason(err)).toMatch(/row-level security|permission denied|violates/i);

    const [{ n }] = (await fixture.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM dns_history WHERE snapshot_hash = 'dns-intruso'`,
    )).rows;
    expect(n).toBe(0);
  });

  it("control positivo de escritura: el dueño sí inserta en su proyecto", async () => {
    await as(OWNER_A, (tx) =>
      tx.insert(dnsHistory).values({
        projectId: PROJECT_A,
        recordType: "TXT",
        query: DOMAIN,
        value: "v=spf1 -all",
        snapshotHash: "dns-propio",
      }),
    );

    const [{ n }] = (await fixture.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM dns_history WHERE snapshot_hash = 'dns-propio'`,
    )).rows;
    expect(n).toBe(1);
  });
});
