/* ═══════════════════════════════════════════════════════════════════════════
   Emisor de eventos webhook (Tanda 4 / B7)

   Garantías:
   - Sin webhooks activos NO se encola nada (coste cero para quien no usa la
     función: no se gastan runs de Trigger.dev).
   - Con suscriptor, se encola `dispatch-webhook-task` con la correlación.
   - Fire-and-forget por contrato: ningún fallo (DB o encolado) se propaga.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitWebhookEvent, findingCreatedData } from "./emit";

// `vi.mock` se eleva al inicio del archivo: los dobles deben crearse con
// `vi.hoisted` para existir cuando se evalúa la fábrica.
const { mockFindFirst, mockTrigger } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockTrigger: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  directDb: { query: { webhookConfigs: { findFirst: mockFindFirst } } },
}));

vi.mock("@/shared/db/schemas", () => ({
  webhookConfigs: { id: "id", projectId: "projectId", active: "active" },
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: mockTrigger },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/request-context", () => ({
  currentCorrelationId: () => "corr-42",
}));

describe("findingCreatedData", () => {
  it("cuenta hallazgos y su reparto por severidad", () => {
    expect(
      findingCreatedData([
        { severity: "critical" },
        { severity: "high" },
        { severity: "high" },
      ]),
    ).toEqual({ count: 3, severities: { critical: 1, high: 2 } });
  });

  it("lista vacía → count 0 y sin severidades", () => {
    expect(findingCreatedData([])).toEqual({ count: 0, severities: {} });
  });
});

describe("emitWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin webhooks activos → false y no encola", async () => {
    mockFindFirst.mockResolvedValue(undefined);
    const ok = await emitWebhookEvent("p1", "finding.created", { count: 1 });
    expect(ok).toBe(false);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("con webhook activo → encola el task con correlación", async () => {
    mockFindFirst.mockResolvedValue({ id: "wh-1" });
    mockTrigger.mockResolvedValue({ id: "run-1" });

    const ok = await emitWebhookEvent("p1", "finding.created", { count: 2 });

    expect(ok).toBe(true);
    expect(mockTrigger).toHaveBeenCalledWith("dispatch-webhook-task", {
      projectId: "p1",
      event: "finding.created",
      data: { count: 2 },
      correlationId: "corr-42",
    });
  });

  it("fallo de BD → false sin lanzar", async () => {
    mockFindFirst.mockRejectedValue(new Error("db caída"));
    await expect(emitWebhookEvent("p1", "uptime.down", {})).resolves.toBe(false);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("fallo al encolar → false sin lanzar", async () => {
    mockFindFirst.mockResolvedValue({ id: "wh-1" });
    mockTrigger.mockRejectedValue(new Error("trigger caído"));
    await expect(emitWebhookEvent("p1", "uptime.down", {})).resolves.toBe(false);
  });
});
