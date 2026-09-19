import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Globe } from "lucide-react";
import { ScoreGauge } from "@/components/ui/ScoreGauge";
import { MetricCard } from "@/components/MetricCard";
import {
  ActivityTimeline,
  buildTimelineEvents,
} from "@/components/ActivityTimeline";

/**
 * Semana 5 — resumen del dashboard: gauge animado con color dinámico,
 * metric cards y timeline de actividad con datos reales.
 */

describe("ScoreGauge", () => {
  it("muestra el valor con su color por umbral", () => {
    const { unmount } = render(<ScoreGauge value={85} ariaLabel="Cobertura" />);
    expect(screen.getByRole("img", { name: "Cobertura" })).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("85").className).toContain(
      "text-corporate-success",
    );
    unmount();
    cleanup();
  });

  it.each([
    [85, "text-corporate-success"],
    [65, "text-corporate-warning"],
    [30, "text-corporate-danger"],
  ])("valor %i usa %s", (value, cls) => {
    render(<ScoreGauge value={value} ariaLabel="g" />);
    expect(screen.getByText(String(value)).className).toContain(cls);
    cleanup();
  });

  it("null muestra estado sin dato", () => {
    render(<ScoreGauge value={null} ariaLabel="g" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    cleanup();
  });
});

describe("MetricCard", () => {
  it("muestra icono, valor y etiqueta", () => {
    render(
      <MetricCard
        icon={<Globe data-testid="metric-icon" />}
        label="Proyectos"
        value="3"
      />,
    );
    expect(screen.getByTestId("metric-icon")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Proyectos")).toBeInTheDocument();
    cleanup();
  });
});

describe("buildTimelineEvents", () => {
  const projects = [
    { id: "a", name: "Viejo", createdAt: "2026-01-01T10:00:00.000Z" },
    { id: "b", name: "Nuevo", createdAt: "2026-09-01T10:00:00.000Z" },
    { id: "c", name: "Sin fecha", createdAt: null },
  ];
  const failedChecks = [{ checkedAt: "2026-09-10T10:00:00.000Z", responseTimeMs: 120 }];

  it("ordena descendente, omite sin fecha y limita a 10", () => {
    const events = buildTimelineEvents({
      projects,
      failedChecks,
      projectAddedLabel: "Añadido",
      checkFailedLabel: "Fallo",
    });
    expect(events).toHaveLength(3);
    expect(events[0].id).toContain("check-fail");
    expect(events[1].detail).toBe("Nuevo");
    expect(events[2].detail).toBe("Viejo");
    expect(events[0].tone).toBe("critical");
    expect(events[1].tone).toBe("info");
  });

  it("respeta el límite", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      createdAt: "2026-09-01T10:00:00.000Z",
    }));
    const events = buildTimelineEvents({
      projects: many,
      failedChecks: [],
      projectAddedLabel: "Añadido",
      checkFailedLabel: "Fallo",
    });
    expect(events).toHaveLength(10);
  });
});

describe("ActivityTimeline", () => {
  it("muestra eventos con badge y hora", () => {
    render(
      <ActivityTimeline
        emptyLabel="Vacío"
        events={[
          {
            id: "e1",
            tone: "critical",
            title: "Fallo",
            detail: "api.example.com",
            at: "2026-09-10T10:00:00.000Z",
            display: "10 sept, 10:00",
          },
        ]}
      />,
    );
    expect(screen.getByText("Fallo")).toBeInTheDocument();
    expect(screen.getByText("api.example.com")).toBeInTheDocument();
    expect(screen.getByText("10 sept, 10:00")).toHaveAttribute(
      "datetime",
      "2026-09-10T10:00:00.000Z",
    );
    cleanup();
  });

  it("vacío muestra el mensaje", () => {
    render(<ActivityTimeline events={[]} emptyLabel="Vacío" />);
    expect(screen.getByText("Vacío")).toBeInTheDocument();
    cleanup();
  });
});
