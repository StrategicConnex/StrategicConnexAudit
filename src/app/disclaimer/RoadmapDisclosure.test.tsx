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
  it("renderiza los 4 grupos con 14 <time> totales dentro de un <details>", () => {
    render(<RoadmapDisclosure messages={messages} locale="es" />);

    const root = screen.getByRole("group");
    expect(root.tagName).toBe("DETAILS");
    for (const group of ["perf", "integrations", "compliance", "refinement"]) {
      expect(root.querySelector(`[data-roadmap-group="${group}"]`)).not.toBeNull();
    }
    expect(root.querySelectorAll("time")).toHaveLength(14);
  });

  it("formatea la fecha al locale: '21 de octubre de 2026' con dateTime ISO", () => {
    render(<RoadmapDisclosure messages={messages} locale="es" />);
    const time = screen.getByText("21 de octubre de 2026");
    expect(time.getAttribute("datetime")).toBe("2026-10-21");
  });

  it("el aviso de estimaciones está visible al final", () => {
    render(<RoadmapDisclosure messages={messages} locale="es" />);
    expect(screen.getByText(messages.notice)).toBeDefined();
  });
});
