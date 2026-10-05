import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AiHealthDashboardClient } from "./health-dashboard.client";
import type { HealthCheckRecord } from "./actions";

// vitest.config no define globals → RTL no auto-limpia; convención del repo.
afterEach(() => {
  cleanup();
});

// Evita tocar service-worker APIs en jsdom.
vi.mock("@/components/PushSubscribeButton", () => ({
  PushSubscribeButton: () => null,
}));

const record: HealthCheckRecord = {
  id: "r1",
  checkedAt: "2026-10-04T15:51:23.000Z",
  overallStatus: "degraded",
  modelsHealthy: 2,
  modelsFailed: 3,
  modelsTotal: 5,
  avgLatencyMs: 2299,
  triggerSource: "cron",
  modelResults: [{ modelId: "model-a:free", status: "healthy", latencyMs: 410 }],
};

describe("AiHealthDashboardClient — estructura de <tbody> (hidratación)", () => {
  it("los tbody solo contienen nodos elemento (sin nodos de texto whitespace)", () => {
    render(
      <AiHealthDashboardClient
        recent={[record]}
        daily={[]}
        models={[]}
        latest={record}
        taskCosts={[]}
      />
    );

    const tbodies = document.querySelectorAll("tbody");
    expect(tbodies.length).toBeGreaterThan(0);
    for (const tbody of Array.from(tbodies)) {
      for (const node of Array.from(tbody.childNodes)) {
        // Un nodo de texto (aunque sea solo espacios de sangría) dentro de
        // <tbody> provoca el error de hidratación de React en HTML.
        expect(node.nodeType).toBe(Node.ELEMENT_NODE);
      }
    }

    // La tabla de últimos chequeos sigue renderizando su contenido real.
    expect(screen.getByText("Últimos Chequeos")).toBeTruthy();
    expect(screen.getByText("1 registros")).toBeTruthy();
  });
});
