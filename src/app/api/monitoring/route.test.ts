/* ═══════════════════════════════════════════════════════════════════════════
   Monitoring — Tests de endpoint

   Verifica los handlers GET/POST con RLS simulado (passthrough):
   - GET: validación de projectId, creación automática de schedule, lista de alerts
   - POST: validación de body, creación/actualización de schedule
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const tx = {
    query: {
      projects: { findFirst: vi.fn() },
      monitoringSchedules: { findFirst: vi.fn() },
      monitoringAlerts: { findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
  };
  return {
    tx,
    getCurrentUserOrThrow: vi.fn(),
  };
});

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, fn: (tx: typeof mocks.tx) => unknown) =>
    fn(mocks.tx),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";

const scheduleRow = {
  id: "sched-1",
  projectId: PROJECT_ID,
  enabled: true,
  interval: "weekly",
  nextRunAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const alertRow = {
  id: "alert-1",
  projectId: PROJECT_ID,
  type: "score_drop",
  message: "Puntuación bajó",
  createdAt: new Date(),
};

// ─── Tests: GET ──────────────────────────────────────────────────────────────

describe("Monitoring — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  it("GET con projectId válido → 200 con schedule y alerts", async () => {
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.tx.query.monitoringSchedules.findFirst.mockResolvedValue(scheduleRow);
    mocks.tx.query.monitoringAlerts.findMany.mockResolvedValue([alertRow]);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/monitoring?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.schedule.id).toBe(scheduleRow.id);
    expect(body.schedule.projectId).toBe(scheduleRow.projectId);
    expect(body.schedule.enabled).toBe(true);
    expect(body.alerts).toHaveLength(1);
  });

  it("GET sin projectId → 400 (ValidationError)", async () => {
    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/monitoring")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("GET con projectId no UUID → 400", async () => {
    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/monitoring?projectId=not-a-uuid")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("GET con proyecto no encontrado → 404", async () => {
    mocks.tx.query.projects.findFirst.mockResolvedValue(undefined);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/monitoring?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("GET crea schedule por defecto cuando no existe", async () => {
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.tx.query.monitoringSchedules.findFirst.mockResolvedValue(undefined);
    mocks.tx.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [scheduleRow]),
      })),
    });
    mocks.tx.query.monitoringAlerts.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/monitoring?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(200);
    expect(mocks.tx.insert).toHaveBeenCalled();
  });

  it("GET retorna alerts vacío cuando no hay alerts", async () => {
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.tx.query.monitoringSchedules.findFirst.mockResolvedValue(scheduleRow);
    mocks.tx.query.monitoringAlerts.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/monitoring?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toEqual([]);
  });

  it("GET sin autenticación → lanza error", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/monitoring?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(500);
  });
});

// ─── Tests: POST ─────────────────────────────────────────────────────────────

describe("Monitoring — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  const validBody = {
    projectId: PROJECT_ID,
    enabled: true,
    interval: "weekly",
  };

  it("POST con body válido (nuevo schedule) → 200", async () => {
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.tx.query.monitoringSchedules.findFirst.mockResolvedValue(undefined);
    mocks.tx.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [scheduleRow]),
      })),
    });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/monitoring", validBody)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.schedule.id).toBe(scheduleRow.id);
    expect(body.schedule.projectId).toBe(scheduleRow.projectId);
  });

  it("POST actualiza schedule existente → 200", async () => {
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.tx.query.monitoringSchedules.findFirst.mockResolvedValue(scheduleRow);
    mocks.tx.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ ...scheduleRow, enabled: false }]),
        })),
      })),
    });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/monitoring", {
        ...validBody,
        enabled: false,
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.tx.update).toHaveBeenCalled();
  });

  it("POST body inválido (falta projectId) → 400", async () => {
    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/monitoring", {
        enabled: true,
        interval: "weekly",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("POST intervalo inválido → 400", async () => {
    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/monitoring", {
        projectId: PROJECT_ID,
        enabled: true,
        interval: "hourly",
      })
    );
    expect(res.status).toBe(400);
  });

  it("POST proyecto no encontrado → 404", async () => {
    mocks.tx.query.projects.findFirst.mockResolvedValue(undefined);

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/monitoring", validBody)
    );
    expect(res.status).toBe(404);
  });

  it("POST sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/monitoring", validBody)
    );
    expect(res.status).toBe(500);
  });

  it("POST body vacío → 400", async () => {
    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/monitoring", {})
    );
    expect(res.status).toBe(400);
  });
});
