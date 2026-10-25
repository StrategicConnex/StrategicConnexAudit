import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ComponentProps } from "react";
import { AiCopilotSidebar } from "./AiCopilotSidebar";
import type { ChatMessage } from "../hooks/useAiChat";

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
    onRequestRemediation: vi.fn(),
    hasActiveInvestigation: false,
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
