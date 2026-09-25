/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Integration Sync Sweep — Tests (TD-10 / TSK-016)

   Verifica:
   - Registro del task (id + cron diario 03:00 UTC)
   - Log `running` insertado por integración y cierre `success`/`failed`
   - Conteo de filas nuevas desde last_sync_at → recordsSynced
   - Sin credenciales → failed; >48h sin sync → expiración de la integración
   - Tipos sin tabla de datos (ahrefs) → success con recordsSynced null
   - Fallos por integración no tumban el barrido
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

interface SweepConfig {
  id: string;
  cron: string;
  retry: { maxAttempts: number };
  run: (payload: { timestamp: Date }) => Promise<{
    success: boolean;
    scanned: number;
    synced: number;
    failures: number;
    expired: number;
    details: Array<{
      id: string;
      type: string;
      outcome: "synced" | "failed" | "expired";
      recordsSynced: number | null;
      error: string | null;
    }>;
    timestamp: string;
  }>;
}

const m = vi.hoisted(() => {
  const select = vi.fn();
  const insert = vi.fn();
  const set = vi.fn();
  const updateWhere = vi.fn();
  const update = vi.fn(() => ({ set }));
  return { select, insert, set, updateWhere, update };
});

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: vi.fn((config: unknown) => config) },
}));

vi.mock("@/shared/db", () => ({
  directDb: { select: m.select, insert: m.insert, update: m.update },
}));

vi.mock("@/shared/db/schemas", () => ({
  integrations: {
    id: "id",
    projectId: "projectId",
    type: "type",
    status: "status",
    credentialsEncrypted: "credentialsEncrypted",
    lastSyncAt: "lastSyncAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  integrationSyncLogs: {
    id: "id",
    integrationId: "integrationId",
    status: "status",
    recordsSynced: "recordsSynced",
    errorMessage: "errorMessage",
    startedAt: "startedAt",
    completedAt: "completedAt",
  },
  integrationDataGsc: { projectId: "projectId", createdAt: "createdAt" },
  integrationDataGa4: { projectId: "projectId", createdAt: "createdAt" },
  integrationDataBing: { projectId: "projectId", createdAt: "createdAt" },
}));

import { integrationSyncSweep } from "./integration-sync.trigger";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

const NOW = new Date("2026-09-25T03:00:00.000Z");

let listRows: Array<Record<string, unknown>> = [];
let countQueue: Array<unknown[] | Error> = [];
const insertCalls: Array<Record<string, unknown>> = [];

const freshGsc = {
  id: "int-gsc",
  projectId: "p1",
  type: "gsc",
  status: "active",
  credentialsEncrypted: "enc",
  lastSyncAt: new Date("2026-09-24T03:00:00.000Z"),
  createdAt: new Date("2026-05-08T18:30:09.581Z"),
};

const staleSeed = {
  id: "int-seed",
  projectId: "p1",
  type: "gsc",
  status: "active",
  credentialsEncrypted: null,
  lastSyncAt: null,
  createdAt: new Date("2026-05-08T18:30:09.581Z"),
};

const freshNeverSynced = {
  id: "int-new",
  projectId: "p1",
  type: "ga4",
  status: "active",
  credentialsEncrypted: null,
  lastSyncAt: null,
  createdAt: new Date("2026-09-24T12:00:00.000Z"),
};

const ahrefsFresh = {
  id: "int-ahrefs",
  projectId: "p1",
  type: "ahrefs",
  status: "active",
  credentialsEncrypted: "enc",
  lastSyncAt: new Date("2026-09-24T03:00:00.000Z"),
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

afterAll(() => {
  logSpy.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  listRows = [];
  countQueue = [];
  insertCalls.length = 0;

  m.select.mockImplementation((cols?: unknown) => ({
    from: () => ({
      where: () => {
        if (cols) {
          const next = countQueue.shift();
          if (next instanceof Error) return Promise.reject(next);
          return Promise.resolve(next ?? [{ n: 0 }]);
        }
        return Promise.resolve(listRows);
      },
    }),
  }));

  m.insert.mockImplementation(() => ({
    values: (values: Record<string, unknown>) => {
      insertCalls.push(values);
      return {
        returning: () =>
          Promise.resolve([{ id: `log-${insertCalls.length}` }]),
      };
    },
  }));

  m.set.mockImplementation(() => ({ where: m.updateWhere }));
  m.updateWhere.mockResolvedValue(undefined);
});

describe("Trigger: integration-sync-sweep", () => {
  const task = integrationSyncSweep as unknown as SweepConfig;
  const payload = { timestamp: NOW };

  it("registra id, cron diario 03:00 UTC y reintentos", () => {
    expect(task.id).toBe("integration-sync-sweep");
    expect(task.cron).toBe("0 3 * * *");
    expect(task.retry.maxAttempts).toBe(3);
  });

  it("sin integraciones activas → barrido vacío sin escrituras", async () => {
    const result = await task.run(payload);

    expect(result).toEqual({
      success: true,
      scanned: 0,
      synced: 0,
      failures: 0,
      expired: 0,
      details: [],
      timestamp: "2026-09-25T03:00:00.000Z",
    });
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.set).not.toHaveBeenCalled();
  });

  it("con credenciales y datos → log running→success + lastSyncAt actualizado", async () => {
    listRows = [freshGsc];
    countQueue = [[{ n: 42 }]];

    const result = await task.run(payload);

    expect(result.success).toBe(true);
    expect(result.scanned).toBe(1);
    expect(result.synced).toBe(1);
    expect(result.failures).toBe(0);
    expect(result.expired).toBe(0);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual({
      integrationId: "int-gsc",
      status: "running",
      startedAt: NOW,
    });

    expect(m.set).toHaveBeenCalledTimes(2);
    expect(m.set.mock.calls[0]![0]).toEqual({
      status: "success",
      recordsSynced: 42,
      errorMessage: null,
      completedAt: NOW,
    });
    expect(m.set.mock.calls[1]![0]).toEqual({
      lastSyncAt: NOW,
      updatedAt: NOW,
    });

    expect(result.details).toEqual([
      {
        id: "int-gsc",
        type: "gsc",
        outcome: "synced",
        recordsSynced: 42,
        error: null,
      },
    ]);
    expect(m.select).toHaveBeenCalledTimes(2);
  });

  it("sin credenciales y stale (>48h) → failed + integración expired", async () => {
    listRows = [staleSeed];

    const result = await task.run(payload);

    expect(result.success).toBe(false);
    expect(result.failures).toBe(1);
    expect(result.expired).toBe(1);

    expect(m.set).toHaveBeenCalledTimes(2);
    expect(m.set.mock.calls[0]![0]).toEqual({
      status: "failed",
      recordsSynced: null,
      errorMessage: "credenciales ausentes; marcada expired (>48h sin sync)",
      completedAt: NOW,
    });
    expect(m.set.mock.calls[1]![0]).toEqual({
      status: "expired",
      updatedAt: NOW,
    });
    expect(result.details[0]!.outcome).toBe("expired");
  });

  it("sin credenciales pero reciente (<48h) → failed sin expirar", async () => {
    listRows = [freshNeverSynced];

    const result = await task.run(payload);

    expect(result.failures).toBe(1);
    expect(result.expired).toBe(0);
    expect(m.set).toHaveBeenCalledTimes(1);
    expect(m.set.mock.calls[0]![0]).toMatchObject({
      status: "failed",
      errorMessage: "credenciales ausentes",
    });
    expect(result.details[0]!.outcome).toBe("failed");
  });

  it("tipo sin tabla de datos (ahrefs) → success con recordsSynced null y sin count", async () => {
    listRows = [ahrefsFresh];

    const result = await task.run(payload);

    expect(result.success).toBe(true);
    expect(result.synced).toBe(1);
    expect(result.details[0]!.recordsSynced).toBeNull();
    expect(m.set.mock.calls[0]![0]).toMatchObject({
      status: "success",
      recordsSynced: null,
    });
    expect(m.select).toHaveBeenCalledTimes(1);
  });

  it("falla el count → failed sin tumbar el resto del barrido", async () => {
    listRows = [freshGsc, ahrefsFresh];
    countQueue = [new Error("db timeout")];

    const result = await task.run(payload);

    expect(result.scanned).toBe(2);
    expect(result.synced).toBe(1);
    expect(result.failures).toBe(1);
    expect(result.success).toBe(false);
    expect(result.details[0]).toMatchObject({
      id: "int-gsc",
      outcome: "failed",
      error: "db timeout",
    });
    expect(result.details[1]!.outcome).toBe("synced");
  });

  it("excepción al insertar el log → se captura y la siguiente integración se procesa", async () => {
    listRows = [freshGsc, ahrefsFresh];
    countQueue = [[{ n: 7 }]];
    m.insert.mockImplementationOnce(() => {
      throw new Error("insert exploded");
    });

    const result = await task.run(payload);

    expect(result.scanned).toBe(2);
    expect(result.synced).toBe(1);
    expect(result.failures).toBe(1);
    expect(result.details[0]).toMatchObject({
      id: "int-gsc",
      outcome: "failed",
      error: "insert exploded",
    });
    expect(result.details[1]!.outcome).toBe("synced");
    expect(insertCalls).toHaveLength(1);
  });
});
