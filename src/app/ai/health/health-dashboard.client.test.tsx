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
        modelCosts={[]}
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

describe("AiHealthDashboardClient — gasto por modelo (C5)", () => {
  it("renderiza una fila por modelo, con su coste y latencia, sin romper <tbody>", () => {
    render(
      <AiHealthDashboardClient
        recent={[record]}
        daily={[]}
        models={[]}
        latest={record}
        taskCosts={[]}
        modelCosts={[
          {
            modelUsed: "nvidia/model-x:free",
            calls: 3,
            tokensIn: 1500,
            tokensOut: 250,
            costUsd: 0.5,
            avgLatencyMs: 1200,
          },
        ]}
      />
    );

    expect(screen.getByText("Gasto por Modelo (7 días)")).toBeTruthy();
    // El id se abrevia: se quita el prefijo de proveedor y el sufijo ":free".
    expect(screen.getByText("model-x")).toBeTruthy();
    expect(screen.getByText("$0.50")).toBeTruthy();

    const fila = screen.getByText("model-x").closest("tr");
    expect(fila).not.toBeNull();
    expect(fila?.textContent).toContain("1200");
    expect(fila?.textContent).toContain("ms");

    // Mismo invariante de hidratación que en la tabla de últimos chequeos.
    for (const tbody of Array.from(document.querySelectorAll("tbody"))) {
      for (const node of Array.from(tbody.childNodes)) {
        expect(node.nodeType).toBe(Node.ELEMENT_NODE);
      }
    }
  });
});
