import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import type { ComponentProps } from "react";
import { AiCopilotSidebar } from "./AiCopilotSidebar";
import type { ChatMessage } from "../hooks/useAiChat";
import type { ChatSuggestion } from "@/shared/types/chat";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

const messages: ChatMessage[] = [
  { role: "user", text: "¿Qué puertos abiertos tengo?" },
  { role: "assistant", text: "No hay hallazgos registrados todavía." },
];

type SidebarProps = ComponentProps<typeof AiCopilotSidebar>;

function baseProps(overrides: Partial<SidebarProps> = {}): SidebarProps {
  return {
    isOpen: true,
    onToggle: vi.fn(),
    messages,
    inputValue: "",
    onInputChange: vi.fn(),
    onSubmit: vi.fn(),
    isGenerating: false,
    onStop: vi.fn(),
    onClearHistory: vi.fn(),
    onRequestRemediation: vi.fn(),
    hasActiveInvestigation: false,
    suggestion: null,
    onDismissSuggestion: vi.fn(),
    ...overrides,
  };
}

describe("AiCopilotSidebar — accesibilidad (tarea 0.8)", () => {
  it("expone la conversación como log con aria-live", () => {
    render(<AiCopilotSidebar {...baseProps()} />);

    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(log.getAttribute("aria-relevant")).toBe("additions");
    expect(log.getAttribute("aria-busy")).toBe("false");
    expect(log.textContent).toContain("¿Qué puertos abiertos tengo?");
    expect(log.textContent).toContain("No hay hallazgos registrados todavía.");
  });

  it("marca aria-busy mientras se genera la respuesta", () => {
    render(<AiCopilotSidebar {...baseProps({ isGenerating: true })} />);

    expect(screen.getByRole("log").getAttribute("aria-busy")).toBe("true");
  });
});

describe("AiCopilotSidebar — acción honesta con 0 hallazgos (Task 0.11)", () => {
  it("renderiza un enlace real cuando el mensaje trae acción", () => {
    render(
      <AiCopilotSidebar
        {...baseProps({
          messages: [
            {
              role: "assistant",
              text: "La investigación aún no tiene hallazgos.",
              action: {
                href: "/intelligence#intelligence-scan",
                label: "Escanear infraestructura",
              },
            },
          ],
        })}
      />
    );

    const link = screen.getByRole("link", { name: /Escanear infraestructura/i });
    expect(link.getAttribute("href")).toBe("/intelligence#intelligence-scan");
  });
});

describe("AiCopilotSidebar — sugerencia anti-nag", () => {
  const suggestion: ChatSuggestion = {
    fingerprint: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    findingIds: ["f-1"],
    investigationId: "inv-1",
    text: "Hay 1 hallazgo crítico reciente. ¿Revisamos el plan?",
    ctaLabel: "Ver plan de remediación",
  };

  it("muestra la plantilla del servidor, su CTA y el descarte", () => {
    render(<AiCopilotSidebar {...baseProps({ suggestion })} />);

    expect(screen.getByText(suggestion.text)).toBeTruthy();
    expect(screen.getByRole("button", { name: suggestion.ctaLabel })).toBeTruthy();
    expect(screen.getByRole("button", { name: "dismissSuggestion" })).toBeTruthy();
  });

  it("el CTA lleva al flujo real de remediación de la investigación sugerida", () => {
    const onRequestRemediation = vi.fn();
    render(
      <AiCopilotSidebar {...baseProps({ suggestion, onRequestRemediation })} />,
    );

    fireEvent.click(screen.getByRole("button", { name: suggestion.ctaLabel }));

    expect(onRequestRemediation).toHaveBeenCalledWith("inv-1");
  });

  it("descartar delega en el callback del hook", () => {
    const onDismissSuggestion = vi.fn();
    render(
      <AiCopilotSidebar {...baseProps({ suggestion, onDismissSuggestion })} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "dismissSuggestion" }));

    expect(onDismissSuggestion).toHaveBeenCalledTimes(1);
  });

  it("sin sugerencia no hay tarjeta", () => {
    render(<AiCopilotSidebar {...baseProps({ suggestion: null })} />);

    expect(screen.queryByText(suggestion.text)).toBeNull();
    expect(screen.queryByRole("button", { name: suggestion.ctaLabel })).toBeNull();
  });

  it("no permite lanzar el plan si la sugerencia no apunta a una investigación", () => {
    render(
      <AiCopilotSidebar
        {...baseProps({ suggestion: { ...suggestion, investigationId: null } })}
      />,
    );

    expect(
      screen.getByRole("button", { name: suggestion.ctaLabel }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("AiCopilotSidebar — streaming, citas y memoria (Sprint 2, C6)", () => {
  it("muestra el estado interrumpido y conserva el parcial", () => {
    render(
      <AiCopilotSidebar
        {...baseProps({
          messages: [
            { role: "user", text: "analiza" },
            { role: "assistant", text: "parcial", interrupted: true },
          ],
        })}
      />,
    );

    expect(screen.getByText("parcial")).toBeTruthy();
    expect(screen.getByText("interrupted")).toBeTruthy();
  });

  it("renderiza solo las citas verificadas como enlaces y abre la evidencia", () => {
    const onOpenReference = vi.fn();
    render(
      <AiCopilotSidebar
        {...baseProps({
          messages: [
            {
              role: "assistant",
              text: "Riesgo [[ref:1]] e [[ref:2]]",
              references: [{ id: "finding-1", title: "SPF ausente" }],
            },
          ],
          onOpenReference,
        })}
      />,
    );

    const links = screen.getAllByRole("link", { name: /\[1\]/ });
    expect(links).toHaveLength(2);
    fireEvent.click(links[0]!);
    expect(onOpenReference).toHaveBeenCalledWith("finding-1");
    expect(screen.getByText("[[ref:2]]")).toBeTruthy();
  });

  it("el botón de borrar historial aparece con conversación y delega en el hook", () => {
    const onClearHistory = vi.fn();
    render(<AiCopilotSidebar {...baseProps({ onClearHistory })} />);

    fireEvent.click(screen.getByRole("button", { name: "clearHistory" }));

    expect(onClearHistory).toHaveBeenCalledTimes(1);
  });

  it("sin conversación no muestra el botón de borrar historial", () => {
    render(
      <AiCopilotSidebar
        {...baseProps({ messages: [{ role: "assistant", text: "Hola" }] })}
      />,
    );

    expect(screen.queryByRole("button", { name: "clearHistory" })).toBeNull();
  });

  it("mientras genera ofrece detener y no enviar", () => {
    const onStop = vi.fn();
    render(
      <AiCopilotSidebar
        {...baseProps({ isGenerating: true, inputValue: "texto", onStop })}
      />,
    );

    expect(screen.queryByRole("button", { name: "sendAria" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "stop" }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
