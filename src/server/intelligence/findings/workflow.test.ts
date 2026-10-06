import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  activityFindMany: vi.fn(),
  withRLS: vi.fn(),
}));

// importOriginal evita romper la importación circular schemas/index ↔ adversary
// (adversary.ts lee targetTypeEnum de intelligence.ts).
vi.mock("@/shared/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/db")>();
  return {
    ...actual,
    directDb: {
      query: {
        intelligenceFindings: { findFirst: mocks.findFirst },
        findingActivity: { findMany: mocks.activityFindMany },
      },
      transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ update: mocks.update, insert: mocks.insert }),
    },
  };
});

vi.mock("@/shared/db/rls", () => ({ withRLS: mocks.withRLS }));

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
  mocks.update.mockReturnValue({
    set: () => ({ where: async () => undefined }),
  });
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.insertValues.mockResolvedValue(undefined);
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
    mocks.findFirst.mockResolvedValue(null);
    const r = await transitionFinding({
      findingId: "id",
      toStatus: "acknowledged",
      actorId: "u1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });

  it("transición ilegal no toca la BD", async () => {
    mocks.findFirst.mockResolvedValue({ id: "id", status: "open", severity: "high", slaHours: null, acknowledgedAt: null });
    const r = await transitionFinding({ findingId: "id", toStatus: "resolved", actorId: "u1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_transition");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("acknowledged fija slaHours y dueAt, y registra actividad", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "f1",
      status: "open",
      severity: "critical",
      slaHours: null,
      acknowledgedAt: null,
    });
    const r = await transitionFinding({
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
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: "f1", fromStatus: "open", toStatus: "acknowledged" }),
    );
  });

  it("resolved marca resolvedAt y no toca SLA", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "f1",
      status: "in_progress",
      severity: "high",
      slaHours: 72,
      acknowledgedAt: new Date("2026-10-01T00:00:00Z"),
    });
    const r = await transitionFinding({ findingId: "f1", toStatus: "resolved", actorId: "u1" });
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
