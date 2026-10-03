/* =========================================================================
   Reports PDF — Store de progreso (pdf_progress) — tests unitarios
   =========================================================================
   Sustituye las claves Redis de Upstash: verifica escritura con upsert por
   PK compuesta (userId, genId), clamp de percent, lectura mapeada y que
   NINGUNA operación propaga errores (fail-safe: el progreso jamás rompe
   la generación del PDF ni el stream SSE).
   ========================================================================= */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ==== Mocks ====

const mocks = vi.hoisted(() => {
  const state = {
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    deleted: [] as unknown[],
    selectRows: [] as unknown[],
    failWrite: false,
    failRead: false,
    failDelete: false,
    failPrune: false,
  };

  const directDb = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async (opts: { set: Record<string, unknown> }) => {
          if (state.failWrite) throw new Error("write down");
          state.inserts.push(values);
          state.updates.push(opts.set);
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (state.failRead) throw new Error("read down");
            return state.selectRows;
          },
        }),
      }),
    }),
    delete: () => ({
      where: async () => {
        if (state.failDelete || state.failPrune) throw new Error("delete down");
        state.deleted.push(true);
      },
    }),
  };

  return { state, directDb, warn: vi.fn() };
});

vi.mock("@/shared/db", () => ({ directDb: mocks.directDb }));
vi.mock("@/lib/logger", () => ({getRequestContext: vi.fn(() => undefined), runWithRequestContext: <T>(_ctx: unknown, fn: () => T): T => fn(),  logger: { warn: mocks.warn } }));

const USER = "11111111-1111-4111-8111-111111111111";
const GEN = "gen-12345678";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.inserts = [];
  mocks.state.updates = [];
  mocks.state.deleted = [];
  mocks.state.selectRows = [];
  mocks.state.failWrite = false;
  mocks.state.failRead = false;
  mocks.state.failDelete = false;
  mocks.state.failPrune = false;
});

describe("writePdfProgress", () => {
  it("inserta con status por defecto y percent clampado a 0-100", async () => {
    const { writePdfProgress } = await import("./pdf-progress");
    await writePdfProgress(USER, GEN, { percent: 150, step: "Cargando" });
    await writePdfProgress(USER, GEN, { percent: -20 });
    await writePdfProgress(USER, GEN, { percent: Number.NaN });

    expect(mocks.state.inserts).toHaveLength(3);
    expect(mocks.state.inserts[0]).toMatchObject({
      userId: USER,
      genId: GEN,
      percent: 100,
      step: "Cargando",
      status: "working",
      error: null,
    });
    expect(mocks.state.inserts[1].percent).toBe(0);
    expect(mocks.state.inserts[2].percent).toBe(0);
  });

  it("upsert lleva status/error/updatedAt a la rama de update", async () => {
    const { writePdfProgress } = await import("./pdf-progress");
    await writePdfProgress(USER, GEN, {
      percent: 100,
      step: "PDF listo",
      status: "complete",
    });

    expect(mocks.state.updates[0]).toMatchObject({
      percent: 100,
      step: "PDF listo",
      status: "complete",
      error: null,
    });
    expect(mocks.state.updates[0].updatedAt).toBeInstanceOf(Date);
  });

  it("no propaga errores del driver (fail-safe)", async () => {
    const { writePdfProgress } = await import("./pdf-progress");
    mocks.state.failWrite = true;

    await expect(
      writePdfProgress(USER, GEN, { percent: 10, step: "x" }),
    ).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });
});

describe("readPdfProgress", () => {
  it("devuelve null cuando no hay fila", async () => {
    const { readPdfProgress } = await import("./pdf-progress");
    await expect(readPdfProgress(USER, GEN)).resolves.toBeNull();
  });

  it("mapea la fila y normaliza nulls a undefined", async () => {
    const { readPdfProgress } = await import("./pdf-progress");
    const updatedAt = new Date();
    mocks.state.selectRows = [
      { percent: 40, step: "Crawling", status: "working", error: null, updatedAt },
    ];

    await expect(readPdfProgress(USER, GEN)).resolves.toEqual({
      percent: 40,
      step: "Crawling",
      status: "working",
      error: undefined,
      updatedAt,
    });
  });

  it("devuelve null y no lanza si el driver falla", async () => {
    const { readPdfProgress } = await import("./pdf-progress");
    mocks.state.failRead = true;

    await expect(readPdfProgress(USER, GEN)).resolves.toBeNull();
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });
});

describe("deletePdfProgress / pruneStalePdfProgress", () => {
  it("borra la fila del (usuario, generación)", async () => {
    const { deletePdfProgress } = await import("./pdf-progress");
    await expect(deletePdfProgress(USER, GEN)).resolves.toBeUndefined();
    expect(mocks.state.deleted).toHaveLength(1);
  });

  it("prune borra filas huérfanas y no propaga errores", async () => {
    const { pruneStalePdfProgress } = await import("./pdf-progress");
    await expect(pruneStalePdfProgress()).resolves.toBeUndefined();
    expect(mocks.state.deleted).toHaveLength(1);

    mocks.state.failPrune = true;
    await expect(pruneStalePdfProgress(1000)).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });

  it("delete no propaga errores del driver", async () => {
    const { deletePdfProgress } = await import("./pdf-progress");
    mocks.state.failDelete = true;

    await expect(deletePdfProgress(USER, GEN)).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });
});
