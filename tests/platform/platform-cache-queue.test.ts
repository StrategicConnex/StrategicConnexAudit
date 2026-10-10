// @vitest-environment node
/**
 * C2/C3 — Caché distribuida y cola de escaneo, contra un Postgres real (PGlite).
 *
 * No usa imitaciones: aplica el DDL real de `drizzle/0040_platform_cache_queue.sql`
 * y ejerce el mismo SQL que corre en producción, para verificar de verdad:
 *   * la caché L2 es compartida entre "instancias" (dos stores, misma tabla);
 *   * la cola reclama con SKIP LOCKED sin doble claim y respeta el cupo por
 *     plan, liberando el slot al completar o fallar.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ROOT, splitStatements } from "../../scripts/db/rls-inventory.mjs";
import {
  createMemoryCacheStore,
  createPostgresCacheStore,
  resolveCacheStore,
  type SqlExec,
} from "@/shared/lib/distributed-cache";
import { createPostgresScanQueue } from "@/server/intelligence/scan-queue";

const MIGRATION = path.join(ROOT, "drizzle/0040_platform_cache_queue.sql");

describe("plataforma Postgres — caché distribuida (C2) y cola de escaneo (C3)", () => {
  let pglite: PGlite;
  let exec: SqlExec;

  beforeAll(async () => {
    pglite = new PGlite();
    for (const stmt of splitStatements(fs.readFileSync(MIGRATION, "utf8"))) {
      await pglite.exec(stmt);
    }
    const d = drizzle(pglite);
    exec = ((q) => d.execute(q)) as unknown as SqlExec;
  });

  afterAll(async () => {
    await pglite?.close();
  });

  // ── C2: caché distribuida ────────────────────────────────────────────────

  describe("distributed_cache", () => {
    it("guarda y recupera un valor con el store postgres", async () => {
      const cache = createPostgresCacheStore(exec);
      await cache.set("dns.lookup::example.com", { ip: "93.184.216.34" });
      expect(await cache.get<{ ip: string }>("dns.lookup::example.com")).toEqual({ ip: "93.184.216.34" });
    });

    it("es compartida entre instancias (dos stores, misma tabla → distribuido)", async () => {
      const instanciaA = createPostgresCacheStore(exec);
      const instanciaB = createPostgresCacheStore(exec);
      await instanciaA.set("whois.lookup::compartido.test", { org: "ACME" });
      expect(await instanciaB.get("whois.lookup::compartido.test")).toEqual({ org: "ACME" });
    });

    it("no devuelve entradas vencidas (TTL)", async () => {
      const cache = createPostgresCacheStore(exec);
      await cache.set("geoip::vencida.test", { asn: 1 }, -1000);
      expect(await cache.get("geoip::vencida.test")).toBeUndefined();
    });

    it("purgeExpired borra solo las vencidas", async () => {
      await pglite.exec("DELETE FROM distributed_cache");
      const cache = createPostgresCacheStore(exec);
      await cache.set("a::vigente", { ok: true }, 60_000);
      await cache.set("a::vencida", { ok: false }, -1000);
      expect(await cache.purgeExpired()).toBe(1);
      expect(await cache.get("a::vigente")).toEqual({ ok: true });
    });

    it("delete elimina una entrada", async () => {
      const cache = createPostgresCacheStore(exec);
      await cache.set("tmp::x", { v: 1 });
      await cache.delete("tmp::x");
      expect(await cache.get("tmp::x")).toBeUndefined();
    });

    it("parametriza la clave (una clave hostil no rompe el SQL)", async () => {
      const cache = createPostgresCacheStore(exec);
      await cache.set("safe::key", { v: "intacto" }, 60_000);
      const hostil = "x'; DROP TABLE distributed_cache; --";
      await cache.set(hostil, { v: "ok" });
      expect(await cache.get(hostil)).toEqual({ v: "ok" });
      // La tabla sigue existiendo y conserva las demás entradas.
      expect(await cache.get("safe::key")).toEqual({ v: "intacto" });
    });

    it("el store en memoria también respeta el TTL", async () => {
      const cache = createMemoryCacheStore();
      await cache.set("m::k", 42, 60_000);
      expect(await cache.get("m::k")).toBe(42);
      await cache.set("m::v", 1, -1);
      expect(await cache.get("m::v")).toBeUndefined();
    });

    it("respeta el override CACHE_STORE", () => {
      const prev = process.env.CACHE_STORE;
      process.env.CACHE_STORE = "postgres";
      expect(resolveCacheStore()).toBe("postgres");
      process.env.CACHE_STORE = "memory";
      expect(resolveCacheStore()).toBe("memory");
      delete process.env.CACHE_STORE;
      if (prev !== undefined) process.env.CACHE_STORE = prev;
    });
  });

  // ── C3: cola de escaneo ──────────────────────────────────────────────────

  describe("scan_queue", () => {
    const limits = { free: 1, pro: 2 };

    async function reset() {
      await pglite.exec("TRUNCATE scan_queue, scan_queue_slots");
    }

    it("encola y reclama un job (status running + slot activo)", async () => {
      const q = createPostgresScanQueue(exec);
      const enq = await q.enqueue({ projectId: crypto.randomUUID(), toolId: "dns.lookup", target: "a.test" });
      expect(enq.id).toBeTruthy();
      const job = await q.claim({ workerId: "w1", limits });
      expect(job?.status).toBe("running");
      expect(job?.claimed_by).toBe("w1");
      expect(job?.tool_id).toBe("dns.lookup");
    });

    it("no sobrepasa el cupo por plan: el segundo claim sin liberar devuelve null", async () => {
      await reset();
      const q = createPostgresScanQueue(exec);
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "free", toolId: "t", target: "1.test" });
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "free", toolId: "t", target: "2.test" });
      expect((await q.claim({ workerId: "w1", limits }))?.status).toBe("running");
      expect(await q.claim({ workerId: "w2", limits })).toBeNull();
    });

    it("completar libera el slot y permite reclamar el siguiente", async () => {
      await reset();
      const q = createPostgresScanQueue(exec);
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "free", toolId: "t", target: "1.test" });
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "free", toolId: "t", target: "2.test" });
      const first = await q.claim({ workerId: "w1", limits });
      expect(await q.complete(first!.id)).toBe(true);
      const second = await q.claim({ workerId: "w2", limits });
      expect(second?.id).not.toBe(first!.id);
    });

    it("dos planes distintos tienen cupos independientes", async () => {
      await reset();
      const q = createPostgresScanQueue(exec);
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "free", toolId: "t", target: "f.test" });
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "pro", toolId: "t", target: "p.test" });
      const a = await q.claim({ workerId: "w1", limits });
      const b = await q.claim({ workerId: "w2", limits });
      expect(new Set([a?.plan, b?.plan])).toEqual(new Set(["free", "pro"]));
    });

    it("un fallo reintenta (queued con backoff) y libera el slot", async () => {
      await reset();
      const q = createPostgresScanQueue(exec);
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "free", toolId: "t", target: "x.test", maxAttempts: 3 });
      const job = await q.claim({ workerId: "w1", limits });
      const res = await q.fail(job!.id, "timeout transitorio");
      expect(res).toEqual({ status: "queued", attempts: 1 });
      // El slot se liberó (la fila de slots volvió a 0).
      const slots = await pglite.query("SELECT active FROM scan_queue_slots WHERE plan = 'free'");
      expect((slots.rows[0] as { active: number }).active).toBe(0);
      // No se reclama hasta que venza el backoff…
      expect(await q.claim({ workerId: "w2", limits })).toBeNull();
      // …y sí cuando el job vuelve a estar disponible.
      await pglite.exec("UPDATE scan_queue SET available_at = now() WHERE id = '" + job!.id + "'");
      expect((await q.claim({ workerId: "w2", limits }))?.id).toBe(job!.id);
    });

    it("agotar max_attempts marca el job como failed", async () => {
      await reset();
      const q = createPostgresScanQueue(exec);
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "free", toolId: "t", target: "dead.test", maxAttempts: 1 });
      const job = await q.claim({ workerId: "w1", limits });
      const res = await q.fail(job!.id, "boom");
      expect(res).toEqual({ status: "failed", attempts: 1 });
      expect(await q.claim({ workerId: "w2", limits })).toBeNull();
    });

    it("respeta la prioridad y reporta estadísticas", async () => {
      await reset();
      const q = createPostgresScanQueue(exec);
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "pro", toolId: "t", target: "low.test", priority: 0 });
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "pro", toolId: "t", target: "high.test", priority: 10 });
      const job = await q.claim({ workerId: "w1", limits });
      expect(job?.target).toBe("high.test");
      const stats = await q.stats();
      expect(stats.find((s) => s.status === "running" && s.plan === "pro")?.n).toBe(1);
      expect(stats.find((s) => s.status === "queued" && s.plan === "pro")?.n).toBe(1);
    });

    it("un job ya reclamado no se vuelve a entregar (no doble claim)", async () => {
      await reset();
      const q = createPostgresScanQueue(exec);
      await q.enqueue({ projectId: crypto.randomUUID(), plan: "free", toolId: "t", target: "once.test" });
      const first = await q.claim({ workerId: "w1", limits });
      expect(first).not.toBeNull();
      const second = await q.claim({ workerId: "w2", limits });
      expect(second).toBeNull();
      await q.complete(first!.id);
      expect(await q.claim({ workerId: "w3", limits })).toBeNull();
    });
  });
});
