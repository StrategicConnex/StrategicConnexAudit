import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import esMessages from "../../../messages/es.json";
import { ThemeProvider } from "@/shared/design-system";
import { DashboardSidebar } from "@/features/dashboard/DashboardSidebar";
import {
  DashboardHeader,
  OPEN_PALETTE_EVENT,
} from "@/features/dashboard/DashboardHeader";
import { MobileBottomNav } from "@/features/dashboard/MobileNav";

/**
 * Semana 3 — layout principal: sidebar por secciones, header con
 * breadcrumbs + ⌘K + notificaciones + avatar, y bottom nav móvil.
 */

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={esMessages}>
      <ThemeProvider>{children}</ThemeProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  // jsdom sin localStorage persistente: stub en memoria para el sidebar.
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  // ThemeProvider escucha prefers-color-scheme: stub sin matchMedia en jsdom.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const StubModal = () => null;

describe("DashboardSidebar", () => {
  it("agrupa la navegación en secciones Principal e Inteligencia", () => {
    render(
      <Providers>
        <DashboardSidebar
          activeTab="overview"
          onTabChange={() => {}}
          projectCount={3}
        />
      </Providers>,
    );
    expect(
      screen.getByRole("heading", { name: "Principal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Inteligencia" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recursos" }),
    ).toBeInTheDocument();
    cleanup();
  });

  it("marca la pestaña activa con aria-current", () => {
    const { unmount } = render(
      <Providers>
        <DashboardSidebar
          activeTab="projects"
          onTabChange={() => {}}
          projectCount={3}
        />
      </Providers>,
    );
    expect(screen.getByRole("button", { name: /Proyectos/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    unmount();
    cleanup();
  });

  it("el toggle colapsa y oculta las secciones", () => {
    render(
      <Providers>
        <DashboardSidebar
          activeTab="overview"
          onTabChange={() => {}}
          projectCount={3}
        />
      </Providers>,
    );
    fireEvent.click(screen.getByTitle("Colapsar sidebar"));
    expect(screen.queryByRole("heading", { name: "Principal" })).not.toBeInTheDocument();
    expect(document.querySelector("aside")?.className).toContain("w-[72px]");
    cleanup();
  });
});

describe("DashboardHeader", () => {
  function renderHeader(props?: {
    notificationCount?: number;
    onOpenSettings?: () => void;
  }) {
    return render(
      <Providers>
        <DashboardHeader
          activeTab="overview"
          NewProjectModal={StubModal}
          onMenu={() => {}}
          onNavigateProjects={() => {}}
          userInitials="AB"
          notificationCount={props?.notificationCount}
          onOpenSettings={props?.onOpenSettings}
        />
      </Providers>,
    );
  }

  it("muestra breadcrumb Inicio / título con aria-current", () => {
    renderHeader();
    expect(
      screen.getByRole("navigation", { name: "Miga de pan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Inicio")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Panel" })).toBeInTheDocument();
    cleanup();
  });

  it("el trigger ⌘K emite el evento de apertura de la paleta", () => {
    renderHeader();
    const seen: string[] = [];
    const onOpen = () => seen.push("open");
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    fireEvent.click(screen.getByRole("button", { name: "Abrir búsqueda global" }));
    expect(seen).toEqual(["open"]);
    window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    cleanup();
  });

  it("Ctrl+K emite el evento de apertura de la paleta", () => {
    renderHeader();
    const seen: string[] = [];
    const onOpen = () => seen.push("open");
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(seen).toEqual(["open"]);
    window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    cleanup();
  });

  it("la campana abre el panel vacío de notificaciones", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Notificaciones" }));
    // Copia real del NotificationCenter (Semana 10): estado vacío con mensaje + ayuda.
    expect(screen.getByText("Sin notificaciones")).toBeInTheDocument();
    expect(
      screen.getByText(/eventos de auditorías, alertas y análisis aparecerán aquí/i),
    ).toBeInTheDocument();
    cleanup();
  });

  it("el avatar abre el menú y Configuración llama al handler", () => {
    const onOpenSettings = vi.fn();
    renderHeader({ onOpenSettings });
    fireEvent.click(screen.getByRole("button", { name: "Cuenta" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Configuración/ }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe("MobileBottomNav", () => {
  it("muestra 5 pestañas, marca la activa y navega al pulsar", () => {
    const onTabChange = vi.fn();
    render(
      <Providers>
        <MobileBottomNav activeTab="projects" onTabChange={onTabChange} />
      </Providers>,
    );
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    const tabs = nav.querySelectorAll("button");
    expect(tabs).toHaveLength(5);
    const active = screen.getByRole("button", { name: "Proyectos" });
    expect(active).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Rendimiento" }));
    expect(onTabChange).toHaveBeenCalledWith("performance");
    cleanup();
  });
});
