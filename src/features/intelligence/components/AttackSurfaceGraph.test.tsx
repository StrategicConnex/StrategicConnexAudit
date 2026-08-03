import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AttackSurfaceGraph } from "./AttackSurfaceGraph";

// ReactFlow es pesado y requiere canvas; lo mockeamos para renderizar el
// componente en jsdom y verificar el sink del <style>.
vi.mock("reactflow", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div data-testid="flow">{children}</div>,
  MiniMap: () => null,
  Controls: () => null,
  Background: () => null,
  useNodesState: (init: unknown) => [init ?? [], vi.fn(), vi.fn()],
  useEdgesState: (init: unknown) => [init ?? [], vi.fn(), vi.fn()],
  addEdge: (p: unknown, eds: unknown[]) => eds,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("AttackSurfaceGraph (sink <style> y datos del grafo)", () => {
  it("el bloque <style> inyectado es una CONSTANTE — no interpola datos del fetch", async () => {
    // El API devuelve nodos con labels controlables (datos del objetivo).
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          nodes: [{ id: "n1", data: { label: '<img src=x onerror=alert(1)>', type: "host" } }],
          edges: [],
        },
      }),
    });

    render(<AttackSurfaceGraph projectId="p1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const styleEl = document.querySelector("style");
    expect(styleEl).not.toBeNull();
    const css = styleEl?.textContent ?? "";

    // El CSS inyectado es la constante del tema oscuro — sin payloads del fetch.
    expect(css).toContain(".react-flow-dark-theme");
    expect(css).not.toContain("<img");
    expect(css).not.toContain("onerror");
    expect(css).not.toContain("alert(1)");
  });

  it("no crea HTML ejecutable a partir de labels del grafo", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          nodes: [{ id: "n1", data: { label: '<script>alert(1)</script>', isVulnerable: true } }],
          edges: [],
        },
      }),
    });

    render(<AttackSurfaceGraph projectId="p1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Los labels van a ReactFlow como props (render seguro), no a innerHTML.
    expect(document.querySelector("script")).toBeNull();
    expect(document.body.innerHTML).not.toContain("<script>alert(1)");
  });

  it("muestra el estado de loading antes de que llegue el fetch", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<AttackSurfaceGraph projectId="p1" />);
    expect(screen.getAllByText(/Loading Topology/i).length).toBeGreaterThan(0);
  });
});
