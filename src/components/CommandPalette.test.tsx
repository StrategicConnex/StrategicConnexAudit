import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import esMessages from "../../messages/es.json";
import { CommandPalette } from "@/components/CommandPalette";
import { OPEN_PALETTE_EVENT } from "@/features/dashboard/DashboardHeader";

/**
 * Semana 4 — paleta de comandos: apertura por evento, filtrado,
 * navegación por teclado y ejecución de acciones.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={esMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const PROJECTS = [
  { id: "p1", name: "Mi Tienda", domain: "tienda.example.com" },
  { id: "p2", name: "Blog Corp", domain: "blog.example.com" },
];

function renderPalette(onNavigateTab = vi.fn()) {
  render(
    <Providers>
      <CommandPalette projects={PROJECTS} onNavigateTab={onNavigateTab} />
    </Providers>,
  );
  return { onNavigateTab };
}

function openPalette() {
  act(() => {
    window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
  });
}

beforeEach(() => {
  push.mockClear();
});

describe("CommandPalette", () => {
  it("cerrada al inicio y abre con el evento de paleta", () => {
    renderPalette();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    openPalette();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
    cleanup();
  });

  it("filtra por texto y muestra el grupo correspondiente", () => {
    renderPalette();
    openPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "rendi" },
    });
    expect(
      screen.getByRole("option", { name: /Rendimiento/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Palabras Clave/ }),
    ).not.toBeInTheDocument();
    cleanup();
  });

  it("Enter ejecuta la acción resaltada (navegar a pestaña)", () => {
    const { onNavigateTab } = renderPalette();
    openPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "rendi" },
    });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onNavigateTab).toHaveBeenCalledWith("performance");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    cleanup();
  });

  it("flechas mueven el resaltado y Enter ejecuta", () => {
    const { onNavigateTab } = renderPalette();
    openPalette();
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    // Segundo item de Navegación = Proyectos
    expect(onNavigateTab).toHaveBeenCalledWith("projects");
    cleanup();
  });

  it("encuentra proyectos por nombre y navega a su página", () => {
    renderPalette();
    openPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "tienda" },
    });
    const option = screen.getByRole("option", { name: /Mi Tienda/ });
    expect(option.textContent).toContain("tienda.example.com");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/projects/p1");
    cleanup();
  });

  it("acción Nuevo proyecto navega a la pestaña de proyectos", () => {
    const { onNavigateTab } = renderPalette();
    openPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "nuevo proyecto" },
    });
    fireEvent.click(screen.getByRole("option", { name: /Nuevo proyecto/ }));
    expect(onNavigateTab).toHaveBeenCalledWith("projects");
    cleanup();
  });

  it("muestra estado vacío sin resultados y cierra con Escape", () => {
    renderPalette();
    openPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "zzz-sin-coincidencias" },
    });
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    cleanup();
  });
});
