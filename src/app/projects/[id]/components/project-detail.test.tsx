import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AuditStatusBadge } from "@/components/ui/AuditStatusBadge";
import { ProjectScoreCard } from "@/components/ProjectScoreCard";
import { ProjectTabs } from "@/app/projects/[id]/components/ProjectTabs";

/**
 * Semana 6 — detalle de proyecto: badge de estado, score card con
 * categorías y tabs Resumen/Auditorías/Configuración.
 */

describe("AuditStatusBadge", () => {
  it.each([
    ["pending", "Pendiente"],
    ["running", "Ejecutando"],
    ["completed", "Completado"],
    ["failed", "Fallido"],
    ["cancelled", "Cancelado"],
    ["canceled", "Cancelado"],
  ])("estado %s muestra %s", (status, label) => {
    render(<AuditStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    cleanup();
  });

  it("estado desconocido cae a Pendiente", () => {
    render(<AuditStatusBadge status="queued" />);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    cleanup();
  });
});

describe("ProjectScoreCard", () => {
  it("gauge grande con categorías y barras", () => {
    render(
      <ProjectScoreCard
        overall={85}
        overallLabel="Salud del proyecto"
        categories={[
          { label: "Salud SEO", value: 85, display: "85%" },
          { label: "Rendimiento", value: 62, display: "62%" },
          { label: "Disponibilidad", value: null, display: "Sin datos" },
        ]}
        updatedLabel="Última auditoría: ayer"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Salud del proyecto" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Salud SEO")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.getByText("Última auditoría: ayer")).toBeInTheDocument();
    cleanup();
  });
});

describe("ProjectTabs", () => {
  function Harness() {
    return (
      <ProjectTabs
        overview={<div>Contenido resumen</div>}
        audits={<div>Contenido auditorías</div>}
        config={<div>Contenido config</div>}
      />
    );
  }

  it("tres pestañas con Resumen activo por defecto", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Resumen" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Contenido resumen")).toBeInTheDocument();
    cleanup();
  });

  it("click cambia de panel", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Auditorías" }));
    expect(screen.getByRole("tab", { name: "Auditorías" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Contenido auditorías")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Configuración" }));
    expect(screen.getByText("Contenido config")).toBeInTheDocument();
    cleanup();
  });
});
