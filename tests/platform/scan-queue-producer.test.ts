// @vitest-environment node
/**
 * C3 — Productor y drenador de la cola de escaneo.
 *
 * El productor se prueba contra un Postgres real (PGlite) con el DDL de
 * `drizzle/0040_platform_cache_queue.sql`: se verifica que estampa el plan que
 * resuelve el policy-enforcer (para que el cupo por plan sea el real) y que no
 * pierde el input del job.
 *
 * El drenador se prueba con una cola falsa: reclama con el cupo por plan,
 * completa o marca `failed` según el resultado, y no reintenta un desenlace
 * legítimo de la tool (`success: false`).
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ROOT, splitStatements } from "../../scripts/db/rls-inventory.mjs";
import {
  createPostgresScanQueue,
  createScanQueueProducer,
  QueueFullError,
  queueLimitForPlan,
  type ScanJobRow,
  type SqlExec,
} from "@/server/intelligence/scan-queue";
import { drainScanQueue, runScanJob } from "@/server/intelligence/scan-queue-worker";

const mockExecuteAndRecord = vi.hoisted(() => vi.fn());

vi.mock("@/server/intelligence/tool-run", () => ({
  executeAndRecordToolRun: mockExecuteAndRecord,
}));

const MIGRATION = path.join(ROOT, "drizzle/0040_platform_cache_queue.sql");

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";
const USER_ID = "123e4567-e89b-12d3-a456-426614174001";

function fakeJob(overrides: Partial<ScanJobRow> = {}): ScanJobRow {
  return {
    id: "job-1",
    project_id: "proj-1",
    user_id: "user-1",
    plan: "free",
    tool_id: "dns.lookup",
    target: "example.com",
    input: { target: "example.com" },
    status: "running",
    priority: 0,
    attempts: 0,
    max_attempts: 3,
    available_at: new Date().toISOString(),
    claimed_at: null,
    claimed_by: "w1",
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("C3 — productor de scan_queue", () => {
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

  beforeEach(async () => {
    await pglite.exec("TRUNCATE scan_queue, scan_queue_slots");
  });

  it("estampa el plan resuelto por el enforcer (para el cupo por plan)", async () => {
    const resolvePlan = vi.fn(async () => "pro");
    const producer = createScanQueueProducer({ exec, resolvePlan });

    const job = await producer.enqueueJob({
      projectId: PROJECT_ID,
      userId: USER_ID,
      toolId: "dns.lookup",
      target: "example.com",
    });

    expect(job.plan).toBe("pro");
    expect(resolvePlan).toHaveBeenCalledWith(PROJECT_ID);
    const row = await pglite.query<{ plan: string; status: string }>(
      "SELECT plan, status FROM scan_queue WHERE id = $1",
      [job.id]
    );
    expect(row.rows[0]).toEqual({ plan: "pro", status: "queued" });
  });

  it("un plan explícito gana y no consulta al resolvedor", async () => {
    const resolvePlan = vi.fn(async () => "pro");
    const producer = createScanQueueProducer({ exec, resolvePlan });

    const job = await producer.enqueueJob({
      projectId: PROJECT_ID,
      plan: "enterprise",
      toolId: "tls.scan",
      target: "example.com",
    });

    expect(job.plan).toBe("enterprise");
    expect(resolvePlan).not.toHaveBeenCalled();
  });

  it("conserva el input del job y sella la investigación dentro del jsonb", async () => {
    const producer = createScanQueueProducer({ exec, resolvePlan: async () => "free" });

    const job = await producer.enqueueJob({
      projectId: PROJECT_ID,
      toolId: "dns.lookup",
      target: "example.com",
      input: { target: "example.com", recordType: "A" },
      investigationId: "inv-9",
    });

    const row = await pglite.query<{ input: Record<string, unknown>; target: string }>(
      "SELECT input, target FROM scan_queue WHERE id = $1",
      [job.id]
    );
    expect(row.rows[0]?.target).toBe("example.com");
    expect(row.rows[0]?.input).toMatchObject({
      target: "example.com",
      recordType: "A",
      investigationId: "inv-9",
    });
  });

  it("contrapresión: al alcanzar el límite del plan lanza QueueFullError y NO inserta", async () => {
    const producer = createScanQueueProducer({ exec, resolvePlan: async () => "free" });
    const limit = queueLimitForPlan("free"); // free = 1 job concurrente × 10

    for (let i = 0; i < limit; i++) {
      await producer.enqueueJob({ projectId: PROJECT_ID, toolId: "dns.lookup", target: `${i}.test` });
    }

    await expect(
      producer.enqueueJob({ projectId: PROJECT_ID, toolId: "dns.lookup", target: "extra.test" })
    ).rejects.toBeInstanceOf(QueueFullError);

    // El rechazo no dejó rastro: la tabla sigue con el límite exacto.
    const rows = await pglite.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM scan_queue WHERE project_id = $1",
      [PROJECT_ID]
    );
    expect(rows.rows[0]?.n).toBe(limit);
  });

  it("contrapresión: lo terminado no ocupa la cola y el límite es por proyecto", async () => {
    const producer = createScanQueueProducer({ exec, resolvePlan: async () => "free" });
    const limit = queueLimitForPlan("free");

    for (let i = 0; i < limit; i++) {
      await producer.enqueueJob({ projectId: PROJECT_ID, toolId: "dns.lookup", target: `${i}.test` });
    }
    await expect(
      producer.enqueueJob({ projectId: PROJECT_ID, toolId: "dns.lookup", target: "otro.test" })
    ).rejects.toBeInstanceOf(QueueFullError);

    // Otro proyecto tiene su propia cola: no lo bloquea el primero.
    const otro = await producer.enqueueJob({
      projectId: "223e4567-e89b-12d3-a456-426614174000",
      toolId: "dns.lookup",
      target: "otro-proyecto.test",
    });
    expect(otro.id).toBeTruthy();

    // Un job terminado (`done`) libera un hueco: ya no es trabajo pendiente.
    await pglite.exec(
      `UPDATE scan_queue SET status = 'done' WHERE project_id = '${PROJECT_ID}' AND target = '0.test'`
    );
    const liberado = await producer.enqueueJob({
      projectId: PROJECT_ID,
      toolId: "dns.lookup",
      target: "tras-el-done.test",
    });
    expect(liberado.id).toBeTruthy();
  });

  it("el límite escala con el plan (enterprise > pro > free, con techo)", () => {
    expect(queueLimitForPlan("free")).toBe(10);
    expect(queueLimitForPlan("pro")).toBe(40);
    expect(queueLimitForPlan("enterprise")).toBe(50);
    expect(queueLimitForPlan("plan-desconocido")).toBe(10);
  });

  it("purgeCompleted borra sólo lo terminado y viejo, y es idempotente", async () => {
    const queue = createPostgresScanQueue(exec);
    const viejo = await queue.enqueue({ projectId: PROJECT_ID, toolId: "t", target: "viejo.test" });
    const reciente = await queue.enqueue({ projectId: PROJECT_ID, toolId: "t", target: "reciente.test" });
    await queue.enqueue({ projectId: PROJECT_ID, toolId: "t", target: "pendiente.test" });

    await pglite.exec(
      `UPDATE scan_queue SET status = 'done', updated_at = now() - interval '20 days' WHERE id = '${viejo.id}'`
    );
    await pglite.exec(`UPDATE scan_queue SET status = 'failed' WHERE id = '${reciente.id}'`);

    // Retención por defecto (14 d): se va el `done` viejo, no el `failed` de hoy.
    expect(await queue.purgeCompleted()).toBe(1);
    // Idempotente: sin nada que purgar devuelve 0 y no falla.
    expect(await queue.purgeCompleted()).toBe(0);

    const quedan = await pglite.query<{ target: string }>("SELECT target FROM scan_queue ORDER BY target");
    expect(quedan.rows.map((r) => r.target)).toEqual(["pendiente.test", "reciente.test"]);

    // Retención 0: también se lleva lo terminado de hoy.
    expect(await queue.purgeCompleted(0)).toBe(1);
    expect(await queue.purgeCompleted()).toBe(0);
  });

  it("stats reporta lo encolado por plan y estado", async () => {
    const producer = createScanQueueProducer({ exec, resolvePlan: async () => "pro" });
    await producer.enqueueJob({ projectId: PROJECT_ID, toolId: "a", target: "1.test" });
    await producer.enqueueJob({ projectId: PROJECT_ID, toolId: "b", target: "2.test" });

    const stats = await producer.stats();
    expect(stats).toEqual([{ status: "queued", plan: "pro", n: 2 }]);
  });
});

describe("C3 — drenador de scan_queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fakeQueue(jobs: ScanJobRow[]) {
    const pending = [...jobs];
    return {
      claim: vi.fn(async () => pending.shift() ?? null),
      complete: vi.fn(async () => true),
      fail: vi.fn(async () => ({ status: "queued", attempts: 1 })),
    };
  }

  it("reclama con el cupo por plan, ejecuta y completa", async () => {
    const queue = fakeQueue([fakeJob(), fakeJob({ id: "job-2" })]);
    const runJob = vi.fn(async () => undefined);

    const result = await drainScanQueue({ queue, runJob, limits: { free: 2 } });

    expect(result).toEqual({ processed: 2, failed: 0 });
    expect(queue.claim).toHaveBeenCalledWith(expect.objectContaining({ limits: { free: 2 } }));
    expect(queue.complete).toHaveBeenCalledTimes(2);
    expect(queue.fail).not.toHaveBeenCalled();
  });

  it("para cuando no quedan jobs", async () => {
    const queue = fakeQueue([]);
    const result = await drainScanQueue({ queue, runJob: vi.fn() });
    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(queue.claim).toHaveBeenCalledTimes(1);
  });

  it("un throw de la ejecución marca failed (reintento con backoff)", async () => {
    const queue = fakeQueue([fakeJob()]);
    const runJob = vi.fn(async () => {
      throw new Error("timeout transitorio de red");
    });

    const result = await drainScanQueue({ queue, runJob });

    expect(result).toEqual({ processed: 0, failed: 1 });
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.fail).toHaveBeenCalledWith("job-1", "timeout transitorio de red");
  });

  it("respeta el tope de jobs por drenado (max)", async () => {
    const queue = fakeQueue([fakeJob(), fakeJob({ id: "job-2" }), fakeJob({ id: "job-3" })]);
    const result = await drainScanQueue({ queue, runJob: vi.fn(async () => undefined) }, { max: 2 });
    expect(result.processed).toBe(2);
    expect(queue.claim).toHaveBeenCalledTimes(2);
  });

  it("runScanJob persiste el run y no lanza si la tool falla (status failed)", async () => {
    mockExecuteAndRecord.mockResolvedValue({ success: false, run: { id: "run-1" } });

    await expect(runScanJob(fakeJob())).resolves.toBeUndefined();
    expect(mockExecuteAndRecord).toHaveBeenCalledWith({
      userId: "user-1",
      projectId: "proj-1",
      investigationId: null,
      toolId: "dns.lookup",
      target: "example.com",
      input: { target: "example.com" },
    });
  });

  it("runScanJob recupera la investigación sellada en el input", async () => {
    mockExecuteAndRecord.mockResolvedValue({ success: true, run: { id: "run-2" } });

    await runScanJob(fakeJob({ input: { target: "example.com", investigationId: "inv-7" } }));

    expect(mockExecuteAndRecord).toHaveBeenCalledWith(
      expect.objectContaining({ investigationId: "inv-7" })
    );
  });

  it("runScanJob lanza si el job no tiene user_id (no se puede ejecutar bajo RLS)", async () => {
    await expect(runScanJob(fakeJob({ user_id: null }))).rejects.toThrow("user_id");
    expect(mockExecuteAndRecord).not.toHaveBeenCalled();
  });
});
