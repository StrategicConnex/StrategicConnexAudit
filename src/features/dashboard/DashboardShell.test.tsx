import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import esMessages from "../../../messages/es.json";
import { ThemeProvider } from "@/shared/design-system";
import { DashboardShell } from "./DashboardShell";

/**
 * H-10b F-C — test (a): el h2 fijo del hero está en el árbol SIN esperar
 * ninguna query. El contenido de este render nunca resuelve (el boundary se
 * queda en el fallback para siempre) y el h2 del LCP igual pinta — es la
 * propiedad que hace que el LCP deje de depender del streaming de datos.
 *
 * `next/dynamic` se mockea como en OverviewTab.test: en jsdom no se cargan
 * chunks diferidos (AiCopilot, NeuralNetworkBackground, NewProjectModal).
 */
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const DynamicStub = () => null;
    return DynamicStub;
  },
}));

beforeEach(() => {
  // ThemeProvider (vía el ThemeSwitcher del sidebar) lee prefers-color-scheme:
  // stub sin matchMedia real en jsdom — mismo patrón que layout.test.tsx.
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

afterEach(cleanup);

/** Contenido que nunca resuelve: la vista de las queries con RLS en frío. */
function PendingContent() {
  throw new Promise(() => {});
}

function renderShell() {
  return render(
    <NextIntlClientProvider locale="es" messages={esMessages}>
      <ThemeProvider>
        <DashboardShell>
          <PendingContent />
        </DashboardShell>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}

describe("DashboardShell · hero fuera del Suspense (H-10b F-C)", () => {
  it("pinta el h2 fijo aunque el contenido jamás resuelva", () => {
    renderShell();

    // El boundary de los paneles se queda en su fallback…
    expect(screen.getByTestId("dashboard-content-skeleton")).toBeTruthy();

    // …pero el h2 del LCP ya existe: no depende de ninguna query.
    const title = screen.getByTestId("hero-title");
    expect(title.textContent).toBe("Tu portafolio en monitoreo");

    // El título de la pestaña también es estático (i18n, sin datos).
    expect(screen.getByText("Centro de Comando")).toBeTruthy();
  });

  it("muestra placeholders honestos en el count y las métricas sin datos", () => {
    renderShell();

    expect(screen.getByTestId("hero-count-badge").textContent).toBe("—");
    // Greeting sin iniciales: la sesión todavía no resolvió.
    expect(screen.getByText("Hola")).toBeTruthy();
  });
});
