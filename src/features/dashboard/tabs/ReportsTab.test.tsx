import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ReportsTab } from "./ReportsTab";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// El CTA de la card navega con scrollIntoView (no disponible en jsdom).
const scrollIntoViewMock = vi.fn();
beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoViewMock;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";

const aiReport = (over: { isGenerating?: boolean } = {}) => ({
  state: {
    text: "", isGenerating: !!over.isGenerating, isCopied: false,
    isFallback: false, progress: 0, status: "",
  },
  generate: vi.fn(),
  copyToClipboard: vi.fn(),
  downloadHtml: vi.fn(),
});

const baseProps = {
  initialProjects: [{ id: PROJECT_ID, name: "Proyecto A" }],
  selectedProjectId: PROJECT_ID,
  setSelectedProjectId: vi.fn(),
  viewMode: "visual" as const,
  setViewMode: vi.fn(),
  setActiveTab: vi.fn(),
  onNavigateToIntelligence: vi.fn(),
};

/** Card 3 = la card del grid que contiene el badge de IA (aiBadge). */
function getAiCardButton() {
  const badge = screen.getByText("aiBadge");
  const card = badge.closest("div.glass-card")!;
  return within(card as HTMLElement).getByRole("button", { name: "generateAi" });
}

describe("ReportsTab — CTA de la Card 3 (Generar con IA)", () => {
  it("con proyecto seleccionado: scrollea a la AI Section y GENERA (reusa aiReport.generate)", () => {
    const aiReportProp = aiReport();
    render(<ReportsTab {...baseProps} aiReport={aiReportProp} />);

    fireEvent.click(getAiCardButton());

    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(aiReportProp.generate).toHaveBeenCalledTimes(1);
  });

  it("sin proyecto seleccionado: scrollea y foca el selector, NO genera en vacío", () => {
    const aiReportProp = aiReport();
    render(<ReportsTab {...baseProps} selectedProjectId="" aiReport={aiReportProp} />);

    fireEvent.click(getAiCardButton());

    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(aiReportProp.generate).not.toHaveBeenCalled();
    expect(document.activeElement?.tagName).toBe("SELECT");
  });

  it("mientras se está generando: no relanza la generación", () => {
    const aiReportProp = aiReport({ isGenerating: true });
    render(<ReportsTab {...baseProps} aiReport={aiReportProp} />);

    fireEvent.click(getAiCardButton());

    expect(aiReportProp.generate).not.toHaveBeenCalled();
  });
});

describe("ReportsTab — alineación de CTAs entre cards", () => {
  it("la Card 3 usa el mismo layout flex column justificado de Cards 1 y 2 (botón al fondo)", () => {
    render(<ReportsTab {...baseProps} aiReport={aiReport()} />);

    const badge = screen.getByText("aiBadge");
    const card = badge.closest("div.glass-card") as HTMLElement;
    const button = within(card).getByRole("button", { name: "generateAi" });
    const wrapperClass = (button.parentElement as HTMLElement)?.className ?? "";
    // El wrapper del botón debe estirar la altura (flex-1) para que
    // justify-between pegue el botón al fondo (alineado con las cards 1 y 2).
    expect(wrapperClass).toMatch(/flex-1/);
    expect(wrapperClass).toMatch(/justify-between/);
  });
});
