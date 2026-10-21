import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UsageDashboard } from "./usage-dashboard.client";
import type { UsageMetrics } from "@/server/admin/usage-metrics";

// vitest.config no define globals → RTL no auto-limpia; convención del repo
// (idéntico a src/app/ai/health/health-dashboard.client.test.tsx).
afterEach(() => {
  cleanup();
});

const metrics: UsageMetrics = {
  totalUsers: 41,
  totalProjects: 7,
  auditsLast30d: 132,
  findingsLast30d: 25,
  findingsBySeverity: { critical: 3, high: 6, medium: 9, low: 7 },
  activeUsersLast7d: 5,
  aiCallsLast30d: 20,
  aiTokensLast30d: { in: 1000, out: 200 },
  aiCostUsdLast30d: 1.5,
  aiCacheHitsLast30d: { hits: 5, total: 20 },
};

const daily = [
  { date: "2026-10-01", n: 3 },
  { date: "2026-10-02", n: 7 },
  { date: "2026-10-03", n: 11 },
];

describe("UsageDashboard — KPIs", () => {
  // Aserción acotada a la tarjeta: los valores sueltos ("7") pueden repetirse
  // en la lista de severidades, así que se valida cada KPI por su contenedor.
  const expectKpi = (label: string, value: string) => {
    const labelNode = screen.getByText(label);
    const card = labelNode.closest("div");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain(value);
  };

  it("renderiza los 8 KPIs con sus valores numéricos", () => {
    render(<UsageDashboard metrics={metrics} daily={daily} />);

    expectKpi("Usuarios totales", "41");
    expectKpi("Usuarios activos (7d)", "5");
    expectKpi("Proyectos", "7");
    expectKpi("Auditorías (30d)", "132");
    expectKpi("Findings (30d)", "25");
    expectKpi("Llamadas IA (30d)", "20");
    expectKpi("Tokens IA (30d)", "1000 / 200");
    expectKpi("Coste IA (30d)", "$1.50");
    expect(screen.getByText("entrada / salida")).toBeTruthy();
  });

  it("deriva el hit-rate de caché IA y lo muestra como hint", () => {
    render(<UsageDashboard metrics={metrics} daily={daily} />);
    // 5 hits / 20 llamadas = 25%.
    expect(screen.getByText("Hit-rate caché: 25%")).toBeTruthy();
  });

  it("oculta el hint de hit-rate cuando no hay llamadas IA (total 0)", () => {
    render(
      <UsageDashboard
        metrics={{ ...metrics, aiCallsLast30d: 0, aiCacheHitsLast30d: { hits: 0, total: 0 } }}
        daily={daily}
      />
    );
    expect(screen.queryByText(/Hit-rate caché/)).toBeNull();
  });
});

describe("UsageDashboard — gráfico y severidades", () => {
  it("renderiza la sección del gráfico de auditorías por día", () => {
    render(<UsageDashboard metrics={metrics} daily={daily} />);
    expect(screen.getByText("Auditorías por día (30d)")).toBeTruthy();
  });

  it("no rompe con serie diaria vacía (fallback defensivo de la action)", () => {
    render(<UsageDashboard metrics={metrics} daily={[]} />);
    expect(screen.getByText("Auditorías por día (30d)")).toBeTruthy();
  });

  it("renderiza findings por severidad con los 4 niveles de inteligencia", () => {
    render(<UsageDashboard metrics={metrics} daily={daily} />);

    expect(screen.getByText("Findings por severidad (30d)")).toBeTruthy();
    for (const severity of ["critical", "high", "medium", "low"] as const) {
      const item = screen.getByText(severity);
      expect(item).toBeTruthy();
      const li = item.closest("li");
      expect(li).not.toBeNull();
      expect(li?.textContent).toContain(String(metrics.findingsBySeverity[severity]));
    }
  });
});
