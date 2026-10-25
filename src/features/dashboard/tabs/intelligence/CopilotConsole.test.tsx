import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CopilotConsole } from "./CopilotConsole";

vi.mock("next-intl", () => {
  const dict: Record<string, string> = {
    generateAiPlan: "Generar Plan IA",
    generatingPlanLong: "Generando plan de remediación…",
  };
  return {
    useTranslations: () => (key: string) => dict[key] ?? key,
  };
});

afterEach(cleanup);

const noop = () => {};

describe("CopilotConsole · carga honesta (Task 0.2)", () => {
  it("muestra un único estado real y ningún paso simulado", () => {
    render(
      <CopilotConsole
        output={null}
        isGenerating
        planCopied={false}
        onGenerate={noop}
        onCopyPlan={noop}
        onReset={noop}
      />
    );

    expect(screen.getByText(/Generando plan de remediación/i)).toBeTruthy();
    expect(screen.queryByText(/Compilando configuraciones/i)).toBeNull();
    expect(screen.queryByText(/Correlacionando brechas/i)).toBeNull();
    expect(screen.queryByText(/Verificando consistencia semántica/i)).toBeNull();
  });

  it("ofrece generar el plan cuando no hay salida ni generación en curso", () => {
    render(
      <CopilotConsole
        output={null}
        isGenerating={false}
        planCopied={false}
        onGenerate={vi.fn()}
        onCopyPlan={noop}
        onReset={noop}
      />
    );

    expect(screen.getByRole("button", { name: /Generar Plan IA/i })).toBeTruthy();
  });
});

describe("CopilotConsole · ausencia honesta (Task 0.11)", () => {
  it("muestra el enlace real a la ejecución de tools junto al mensaje de ausencia", () => {
    render(
      <CopilotConsole
        output="La investigación aún no tiene hallazgos."
        isGenerating={false}
        planCopied={false}
        onGenerate={noop}
        onCopyPlan={noop}
        onReset={noop}
        action={{
          href: "/intelligence#intelligence-scan",
          label: "Escanear infraestructura",
        }}
      />
    );

    const link = screen.getByRole("link", { name: /Escanear infraestructura/i });
    expect(link.getAttribute("href")).toBe("/intelligence#intelligence-scan");
  });
});
