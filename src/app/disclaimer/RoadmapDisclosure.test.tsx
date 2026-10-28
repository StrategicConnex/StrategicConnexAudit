// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RoadmapDisclosure, type RoadmapMessages } from "./RoadmapDisclosure";
import es from "./es.json";

const messages = (es as { disclaimer: { roadmap: RoadmapMessages } }).disclaimer.roadmap;

// La config de vitest no activa globals/auto-cleanup: el repo usa cleanup()
// explícito (patrón CommandPalette.test.tsx) para no acumular renders.
beforeEach(() => {
  cleanup();
});

describe("RoadmapDisclosure", () => {
  it("renderiza 4 grupos, 10 fechas y la fecha pendiente dentro de un <details>", () => {
    render(<RoadmapDisclosure messages={messages} locale="es" />);

    const root = screen.getByRole("group");
    expect(root.tagName).toBe("DETAILS");
    for (const group of ["perf", "integrations", "compliance", "refinement"]) {
      expect(root.querySelector(`[data-roadmap-group="${group}"]`)).not.toBeNull();
    }
    expect(root.querySelectorAll("time")).toHaveLength(10);
    expect(root.textContent).toContain(messages.dateToBeConfirmed);
  });

  it("formatea una fecha estimada al locale y conserva el dateTime ISO", () => {
    render(<RoadmapDisclosure messages={messages} locale="es" />);
    const time = screen.getByText("6 de noviembre de 2026");
    expect(time.getAttribute("datetime")).toBe("2026-11-06");
  });

  it("el aviso de estimaciones está visible al final", () => {
    render(<RoadmapDisclosure messages={messages} locale="es" />);
    expect(screen.getByText(messages.notice)).toBeDefined();
  });
});
