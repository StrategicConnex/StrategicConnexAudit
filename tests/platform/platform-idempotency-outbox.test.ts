// @vitest-environment node
/**
 * A6/C6 — Idempotencia de endpoints y outbox transaccional, contra un Postgres
 * real (PGlite).
 *
 * Aplica el DDL real de `drizzle/0041_platform_idempotency_outbox.sql` y ejerce
 * el mismo SQL que corre en producción, para verificar de verdad:
 *   * la clave de idempotencia se reclama una sola vez y sirve la respuesta
 *     guardada en el reintento (replay);
 *   * el outbox reclama con SKIP LOCKED sin doble claim, reintenta con backoff
 *     y agota `max_attempts`;
 *   * el rol `authenticated` PUEDE encolar (GRANT INSERT + policy) y no puede
 *     leer (fail-closed).
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ROOT, splitStatements } from "../../scripts/db/rls-inventory.mjs";
import {
  createPostgresIdempotencyStore,
  hashRequestBody,
  type SqlExec,
} from "@/shared/lib/idempotency";
import { createPostgresOutbox } from "@/server/webhooks/outbox";

const MIGRATION = path.join(ROOT, "drizzle/0041_platform_idempotency_outbox.sql");

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("plataforma — idempotencia (A6) y outbox (C6)", () => {
  let pglite: PGlite;
  let exec: SqlExec;

  beforeAll(async () => {
    pglite = new PGlite();
    // Prerrequisitos de la migración: el rol `authenticated` y el helper que
    // usa la policy de inserción (en prod lo crea 0025).
    await pglite.exec(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE FUNCTION public.user_has_project_access(p_project_id uuid) RETURNS boolean
        LANGUAGE sql STABLE AS $$ SELECT true $$;
    `);
    for (const stmt of splitStatements(fs.readFileSync(MIGRATION, "utf8"))) {
      await pglite.exec(stmt);
    }
    const d = drizzle(pglite);
    exec = ((q) => d.execute(q)) as unknown as SqlExec;
  });

  afterAll(async () => {
    await pglite?.close();
  });

  // ── A6: claves de idempotencia ───────────────────────────────────────────

  describe("idempotency_keys", () => {
    const store = () => createPostgresIdempotencyStore(exec);

    async function reset() {
      await pglite.exec("TRUNCATE idempotency_keys");
    }

    it("la primera petición reclama la clave", async () => {
      await reset();
      const begun = await store().begin({
        scopeKey: "key-1",
        userId: USER_A,
        endpoint: "POST /api/webhooks",
        requestHash: hashRequestBody("{}"),
        ttlMs: 60_000,
      });
      expect(begun.acquired).toBe(true);
    });

    it("el reintento con la misma clave NO ejecuta de nuevo (replay)", async () => {
      await reset();
      const s = store();
      const first = await s.begin({
        scopeKey: "key-2",
        userId: USER_A,
        endpoint: "POST /api/webhooks",
        requestHash: hashRequestBody("{}"),
        ttlMs: 60_000,
      });
      expect(first.acquired).toBe(true);
      if (first.acquired) await s.storeResponse(first.id, 200, { success: true, id: "wh-1" });

      const second = await s.begin({
        scopeKey: "key-2",
        userId: USER_A,
        endpoint: "POST /api/webhooks",
        requestHash: hashRequestBody("{}"),
        ttlMs: 60_000,
      });
      expect(second.acquired).toBe(false);
      if (!second.acquired) {
        expect(second.row.status).toBe("completed");
        expect(second.row.response_status).toBe(200);
        expect(second.row.response_body).toEqual({ success: true, id: "wh-1" });
      }
    });

    it("detecta reutilización de la clave con OTRO cuerpo (hash distinto)", async () => {
      await reset();
      const s = store();
      await s.begin({
        scopeKey: "key-3",
        userId: USER_A,
        endpoint: "POST /api/webhooks",
        requestHash: hashRequestBody('{"name":"a"}'),
        ttlMs: 60_000,
      });
      const other = await s.begin({
        scopeKey: "key-3",
        userId: USER_A,
        endpoint: "POST /api/webhooks",
        requestHash: hashRequestBody('{"name":"b"}'),
        ttlMs: 60_000,
      });
      expect(other.acquired).toBe(false);
      if (!other.acquired) expect(other.row.request_hash).not.toBe(hashRequestBody('{"name":"b"}'));
    });

    it("la clave es única por usuario (dos usuarios pueden usar el mismo valor)", async () => {
      await reset();
      const s = store();
      const a = await s.begin({ scopeKey: "dup", userId: USER_A, endpoint: "POST /api/webhooks", requestHash: "h", ttlMs: 60_000 });
      const b = await s.begin({ scopeKey: "dup", userId: USER_B, endpoint: "POST /api/webhooks", requestHash: "h", ttlMs: 60_000 });
      expect(a.acquired).toBe(true);
      expect(b.acquired).toBe(true);
    });

    it("release libera una clave en curso; purgeExpired borra las caducadas", async () => {
      await reset();
      const s = store();
      const begun = await s.begin({ scopeKey: "rel", userId: USER_A, endpoint: "E", requestHash: "h", ttlMs: -1000 });
      expect(begun.acquired).toBe(true);
      expect(await s.purgeExpired()).toBe(1);

      const begun2 = await s.begin({ scopeKey: "rel2", userId: USER_A, endpoint: "E", requestHash: "h", ttlMs: 60_000 });
      if (begun2.acquired) await s.release(begun2.id);
      const again = await s.begin({ scopeKey: "rel2", userId: USER_A, endpoint: "E", requestHash: "h", ttlMs: 60_000 });
      expect(again.acquired).toBe(true);
    });
  });

  // ── C6: outbox de eventos ────────────────────────────────────────────────

  describe("outbox_events", () => {
    const outbox = () => createPostgresOutbox(exec);

    async function seed(eventType = "finding.created") {
      await pglite.query(
        `INSERT INTO outbox_events (event_type, project_id, payload, max_attempts)
         VALUES ($1, $2, '{"count":1}'::jsonb, 2)`,
        [eventType, PROJECT_ID],
      );
    }

    async function reset() {
      await pglite.exec("TRUNCATE outbox_events");
    }

    it("reclama una fila pending y la marca processing (sin doble claim)", async () => {
      await reset();
      await seed();
      const o = outbox();
      const first = await o.claim("w1");
      expect(first?.status).toBe("processing");
      expect(first?.claimed_by).toBe("w1");
      expect(await o.claim("w2")).toBeNull();
    });

    it("complete marca done y deja de reclamarse", async () => {
      await reset();
      await seed();
      const o = outbox();
      const row = await o.claim("w1");
      expect(await o.complete(row!.id)).toBe(true);
      expect(await o.claim("w2")).toBeNull();
      const stats = await o.stats();
      expect(stats.find((s) => s.status === "done")?.n).toBe(1);
    });

    it("un fallo reintenta (pending con backoff) y luego agota max_attempts", async () => {
      await reset();
      await seed(); // max_attempts = 2
      const o = outbox();
      const first = await o.claim("w1");
      expect(await o.fail(first!.id, "endpoint caído")).toEqual({ status: "pending", attempts: 1 });
      // Backoff: no se reclama hasta que venza.
      expect(await o.claim("w2")).toBeNull();
      await pglite.exec(`UPDATE outbox_events SET available_at = now() WHERE id = '${first!.id}'`);
      const second = await o.claim("w2");
      expect(await o.fail(second!.id, "otra vez")).toEqual({ status: "failed", attempts: 2 });
      expect(await o.claim("w3")).toBeNull();
    });

    it("respeta la prioridad", async () => {
      await reset();
      await pglite.exec(`
        INSERT INTO outbox_events (event_type, project_id, payload, priority) VALUES
          ('a', '${PROJECT_ID}', '{}'::jsonb, 0),
          ('b', '${PROJECT_ID}', '{}'::jsonb, 10);
      `);
      const row = await outbox().claim("w1");
      expect(row?.event_type).toBe("b");
    });

    it("el rol authenticated PUEDE encolar el evento de su proyecto (GRANT + policy)", async () => {
      await reset();
      await pglite.exec("BEGIN");
      try {
        await pglite.query("SELECT set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: USER_A, role: "authenticated" }),
        ]);
        await pglite.exec("SET LOCAL ROLE authenticated");
        await pglite.query(
          `INSERT INTO outbox_events (event_type, project_id, payload) VALUES ('finding.created', $1, '{}'::jsonb)`,
          [PROJECT_ID],
        );
      } finally {
        await pglite.exec("ROLLBACK");
      }
      // El INSERT como authenticated no lanzó → grant + policy funcionan.
      await pglite.exec("BEGIN");
      try {
        await pglite.exec("SET LOCAL ROLE authenticated");
        await expect(
          pglite.query("SELECT count(*) FROM outbox_events"),
        ).rejects.toThrow(/permission denied|row-level security/i);
      } finally {
        await pglite.exec("ROLLBACK");
      }
    });
  });
});
