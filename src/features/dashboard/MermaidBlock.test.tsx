import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MermaidBlock } from "./MermaidBlock";

// Mermaid se importa dinámicamente; lo mockeamos para controlar el render y
// verificar que la defensa XSS (securityLevel: 'strict') siempre se aplica.
const initializeMock = vi.fn();
const renderMock = vi.fn();

vi.mock("mermaid", () => ({
  default: {
    initialize: initializeMock,
    render: renderMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  initializeMock.mockClear();
  renderMock.mockClear();
  renderMock.mockResolvedValue({
    svg: "<svg xmlns='http://www.w3.org/2000/svg'><text>diagrama</text></svg>",
  });
});

describe("MermaidBlock (XSS defense en diagramas de la IA)", () => {
  it("inicializa mermaid SIEMPRE con securityLevel 'strict'", async () => {
    render(<MermaidBlock code="flowchart TD\nA-->B" />);
    await waitFor(() => expect(renderMock).toHaveBeenCalled());

    const initOptions = initializeMock.mock.calls[0][0];
    expect(initOptions.securityLevel).toBe("strict");
  });

  it("no inyecta el código crudo del diagrama en el DOM (solo el SVG renderizado)", async () => {
    // El código viene de salida IA (reportes) — puede contener HTML malicioso.
    const maliciousCode =
      'flowchart TD\nA["<script>alert(1)</script>"]-->B["<img src=x onerror=alert(2)>"]';
    render(<MermaidBlock code={maliciousCode} />);

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    // El código crudo NUNCA debe aparecer como HTML ejecutable en el DOM.
    expect(document.body.querySelector("script")).toBeNull();
    expect(document.body.innerHTML).not.toContain("<script>alert(1)");
    // El código pasa a mermaid.render (que aplica sanitización strict), no al DOM.
    expect(renderMock.mock.calls[0][1]).toContain("<script>");
  });

  it("muestra el SVG generado por mermaid", async () => {
    render(<MermaidBlock code="flowchart TD\nA-->B" />);
    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    // jsdom puede duplicar nodos de texto al inyectar SVG vía dangerouslySetInnerHTML;
    // la aserción de presencia es la que valida la defensa.
    expect(document.querySelector("svg")).not.toBeNull();
    expect(screen.getAllByText("diagrama").length).toBeGreaterThan(0);
  });

  it("muestra el error como texto cuando mermaid falla", async () => {
    renderMock.mockRejectedValueOnce(new Error("parse error"));
    render(<MermaidBlock code="bad syntax" />);
    await waitFor(() => expect(screen.getByText(/parse error/)).toBeTruthy());
  });
});
