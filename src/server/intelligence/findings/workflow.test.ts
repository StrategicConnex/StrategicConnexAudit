import { describe, it, expect, vi, beforeEach } from "vitest";
// El barril de schemas se evalúa PRIMERO para romper el ciclo
// intelligence.ts ↔ schemas/index.ts ↔ adversary.ts (targetTypeEnum).
import "@/shared/db/schemas";

const mocks = vi.hoisted(() => ({
  withRLS: vi.fn(),
}));

// `withRLS` sólo lo usa `listFindingsForBoard` (lectura del tablero); el resto de
// las funciones del ciclo de vida reciben el ejecutor por parámetro (P0.2), así
// que aquí se les pasa uno falso y no hace falta tocar `@/shared/db`.
vi.mock("@/shared/db/rls", () => ({ withRLS: mocks.withRLS }));

/** Cadena encadenable de drizzle: cada método se devuelve a sí mismo y el objeto
 *  es «thenable», así que `await tx.select(...).from(...).where(...)` resuelve al
 *  valor indicado sin tocar ninguna base de datos. */
function chain(value: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit", "groupBy"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(value).then(resolve, reject);
  return builder;
}

/**
 * Ejecutor falso con la forma que usa el servicio: `select` para la lectura
 * previa y un `transaction` que entrega las dos escrituras (UPDATE del estado e
 * INSERT del historial).
 */
function fakeExecutor(selected: unknown[] = [], returning: unknown[] = []) {
  const update = vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => returning }) }) }));
  const insertValues = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const select = vi.fn(() => chain(selected));
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({ update, insert }));
  return { select, update, insert, insertValues, transaction };
}

import {
  FINDING_TRANSITIONS,
  TERMINAL_STATUSES,
  canTransition,
  resolveSlaHours,
  computeDueAt,
  isOverdue,
  DEFAULT_SLA_HOURS,
  transitionFinding,
  listFindingsForBoard,
} from "./workflow";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("máquina de estados", () => {
  it("open solo puede acusarse", () => {
    expect(canTransition("open", "acknowledged")).toBe(true);
    expect(canTransition("open", "resolved")).toBe(false);
    expect(canTransition("open", "in_progress")).toBe(false);
  });

  it("los estados terminales no salen (un scan no reabre un ticket cerrado)", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(FINDING_TRANSITIONS[s]).toEqual([]);
      expect(canTransition(s, "open")).toBe(false);
    }
  });

  it("desde in_progress se puede cerrar o volver a acknowledged", () => {
    expect(canTransition("in_progress", "resolved")).toBe(true);
    expect(canTransition("in_progress", "false_positive")).toBe(true);
    expect(canTransition("in_progress", "accepted_risk")).toBe(true);
    expect(canTransition("in_progress", "acknowledged")).toBe(true);
  });
});

describe("SLA", () => {
  it("el override del hallazgo gana al default por severidad", () => {
    expect(resolveSlaHours("critical", 12)).toBe(12);
    expect(resolveSlaHours("critical", null)).toBe(DEFAULT_SLA_HOURS.critical);
  });

  it("computeDueAt suma horas y isOverdue compara contra ahora", () => {
    const now = new Date("2026-10-05T00:00:00.000Z");
    const due = computeDueAt(now, 24);
    expect(due.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(isOverdue(due, new Date("2026-10-05T12:00:00.000Z"))).toBe(false);
    expect(isOverdue(due, new Date("2026-10-07T00:00:00.000Z"))).toBe(true);
  });

  it("sin due_at no hay incumplimiento", () => {
    expect(isOverdue(null)).toBe(false);
  });
});

describe("transitionFinding", () => {
  it("hallazgo inexistente → not_found", async () => {
    const exec = fakeExecutor([]);
    const r = await transitionFinding(exec, {
      findingId: "id",
      toStatus: "acknowledged",
      actorId: "u1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });

  it("transición ilegal no toca la BD", async () => {
    const exec = fakeExecutor([{ id: "id", status: "open", severity: "high", slaHours: null, acknowledgedAt: null }]);
    const r = await transitionFinding(exec, { findingId: "id", toStatus: "resolved", actorId: "u1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_transition");
    expect(exec.update).not.toHaveBeenCalled();
    expect(exec.transaction).not.toHaveBeenCalled();
  });

  it("acknowledged fija slaHours y dueAt, y registra actividad", async () => {
    const exec = fakeExecutor([
      {
        id: "f1",
        status: "open",
        severity: "critical",
        slaHours: null,
        acknowledgedAt: null,
      },
    ]);
    const r = await transitionFinding(exec, {
      findingId: "f1",
      toStatus: "acknowledged",
      actorId: "u1",
      note: "visto",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("acknowledged");
      expect(r.dueAt).toBeTruthy();
    }
    // Las dos escrituras van por el ejecutor recibido, en una transacción
    // (savepoint si el llamante ya está dentro de la suya).
    expect(exec.transaction).toHaveBeenCalledTimes(1);
    expect(exec.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: "f1", fromStatus: "open", toStatus: "acknowledged" }),
    );
  });

  it("resolved marca resolvedAt y no toca SLA", async () => {
    const exec = fakeExecutor([
      {
        id: "f1",
        status: "in_progress",
        severity: "high",
        slaHours: 72,
        acknowledgedAt: new Date("2026-10-01T00:00:00Z"),
      },
    ]);
    const r = await transitionFinding(exec, { findingId: "f1", toStatus: "resolved", actorId: "u1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dueAt).toBeNull();
  });
});

describe("listFindingsForBoard", () => {
  it("marca overdue solo si está vencido y no cerrado", async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    const base = {
      projectId: "p1",
      title: "t",
      description: "d",
      severity: "high" as const,
      assigneeId: null,
      slaHours: 24,
      acknowledgedAt: past,
      resolvedAt: null,
      suppressedUntil: null,
      suppressedReason: null,
      affectedAsset: null,
      aiTriage: null,
      createdAt: past,
    };
    mocks.withRLS.mockResolvedValue([
      { ...base, id: "a", status: "in_progress", dueAt: past },
      { ...base, id: "b", status: "acknowledged", dueAt: future },
      { ...base, id: "c", status: "resolved", dueAt: past },
    ]);

    const rows = await listFindingsForBoard({ userId: "u1", projectId: "p1" });
    expect(rows.find((r) => r.id === "a")!.overdue).toBe(true);
    expect(rows.find((r) => r.id === "b")!.overdue).toBe(false);
    expect(rows.find((r) => r.id === "c")!.overdue).toBe(false);
  });
});
