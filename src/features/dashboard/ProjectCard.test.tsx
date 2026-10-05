import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProjectCard } from "./ProjectCard";
import type { ProjectWithNested } from "@/shared/db/types";

// vitest.config no define globals → RTL no auto-limpia; convención del repo.
afterEach(() => {
  cleanup();
});

const baseProject = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Proyecto de Prueba",
  domain: "https://example.org",
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  integrations: [],
  latestAudit: null,
} as unknown as ProjectWithNested;

describe("ProjectCard — honestidad de score y estado", () => {
  it("sin auditoría: no inventa el score 45 ni muestra 'Escaneando'", () => {
    render(<ProjectCard project={{ ...baseProject, latestAudit: null }} />);
    // El score debe ser un dato real o '—', nunca un 45 fabricado.
    expect(screen.queryByText("45")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    // Sin auditoría en curso no hay escaneo activo: nada de badge animado.
    expect(screen.queryByText("Escaneando")).toBeNull();
    expect(screen.getByText("Sin escanear")).toBeTruthy();
    expect(document.querySelector(".animate-ping")).toBeNull();
  });

  it("auditoría en curso: muestra 'Escaneando' con animación (estado real)", () => {
    render(
      <ProjectCard
        project={{
          ...baseProject,
          latestAudit: { id: "a1", status: "running", healthScore: null },
        }}
      />
    );
    expect(screen.getByText("Escaneando")).toBeTruthy();
    expect(document.querySelector(".animate-ping")).toBeTruthy();
    expect(screen.queryByText("45")).toBeNull();
    expect(screen.queryByText("85")).toBeNull();
  });

  it("auditoría completada con score real: muestra ese score, no 85", () => {
    render(
      <ProjectCard
        project={{
          ...baseProject,
          latestAudit: { id: "a1", status: "completed", healthScore: 92 },
        }}
      />
    );
    expect(screen.getByText("92")).toBeTruthy();
    expect(screen.getByText("Activo")).toBeTruthy();
    expect(screen.queryByText("85")).toBeNull();
  });

  it("auditoría completada sin score calculable: muestra '—', no 85", () => {
    render(
      <ProjectCard
        project={{
          ...baseProject,
          latestAudit: { id: "a1", status: "completed", healthScore: null },
        }}
      />
    );
    expect(screen.queryByText("85")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Activo")).toBeTruthy();
  });
});
