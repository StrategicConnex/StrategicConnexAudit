import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import esMessages from "../../../messages/es.json";
import { ThemeProvider } from "@/shared/design-system";
import {
  DashboardUIContext,
  type DashboardUIValue,
  type DashboardChrome,
  type DashboardLiveHero,
} from "./dashboard-ui-context";
import { HeroSummary } from "./HeroSummary";
import type { ProjectRow, ProjectWithNested } from "@/shared/db/types";

/**
 * H-10b F-C — test (b): el count se rellena IN PLACE bajo el h2 fijo.
 *
 * La regla de CLS/LCP del fix es que el h2 nunca se muta ni se reemplaza y
 * la sublínea de badge ocupa siempre la misma línea: este test fija que el
 * nodo del badge es el MISMO antes y después de llegar los datos (un nodo
 * nuevo = swap = riesgo de CLS y de un LCP candidate nuevo).
 *
 * El umbral numérico CLS < 0,1 se verifica en lab con
 * `scripts/e2e/lcp-diag.mjs` post-push (campo: RUM en web_vitals_logs).
 */

beforeEach(() => {
  // ThemeProvider lee prefers-color-scheme en el mount: stub en jsdom
  // (mismo patrón que layout.test.tsx).
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

function ui(partial: Partial<DashboardUIValue>): DashboardUIValue {
  return {
    activeTab: "overview",
    setActiveTab: () => {},
    chrome: null,
    live: null,
    publishChrome: () => {},
    publishLive: () => {},
    ...partial,
  };
}

/** Filas mínimas: HeroSummary solo lee longitud, latestAudit y userInitials. */
function chromeCon(n: number, audited: number): DashboardChrome {
  const projects = Array.from({ length: n }, (_, i) => ({ id: `p-${i}` })) as ProjectRow[];
  const dashboardData = Array.from({ length: n }, (_, i) => ({
    id: `p-${i}`,
    latestAudit: i < audited ? { id: `a-${i}` } : null,
  })) as unknown as ProjectWithNested[];
  return { initialProjects: projects, dashboardData, userInitials: "AB" };
}

const live: DashboardLiveHero = {
  uptimePercent: 0.995,
  failedChecks: 1,
  checksLoading: false,
};

function pintar(value: DashboardUIValue) {
  return render(
    <NextIntlClientProvider locale="es" messages={esMessages}>
      <ThemeProvider>
        <DashboardUIContext.Provider value={value}>
          <HeroSummary />
        </DashboardUIContext.Provider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}

describe("HeroSummary · h2 fijo + badge de count (H-10b F-C)", () => {
  it("sin datos: h2 con copy fijo y placeholders en count/métricas", () => {
    pintar(ui({}));
    expect(screen.getByTestId("hero-title").textContent).toBe("Tu portafolio en monitoreo");
    expect(screen.getByTestId("hero-count-badge").textContent).toBe("—");
    // Ningún valor sin dato se pinta como número.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });

  it("rellena el count en el MISMO nodo, sin tocar el h2 (CLS ~0)", () => {
    const { rerender } = pintar(ui({}));
    const badgeAntes = screen.getByTestId("hero-count-badge");
    const tituloAntes = screen.getByTestId("hero-title");
    expect(badgeAntes.textContent).toBe("—");

    // Simula el publish de DashboardContainer tras hidratar los paneles.
    rerender(
      <NextIntlClientProvider locale="es" messages={esMessages}>
        <ThemeProvider>
          <DashboardUIContext.Provider value={ui({ chrome: chromeCon(3, 2), live })}>
            <HeroSummary />
          </DashboardUIContext.Provider>
        </ThemeProvider>
      </NextIntlClientProvider>
    );

    // Mismo nodo → no hay swap que desplace layout.
    expect(screen.getByTestId("hero-count-badge")).toBe(badgeAntes);
    expect(badgeAntes.textContent).toBe("Tienes 3 proyectos en monitoreo");

    // El h2 no muta: mismo nodo, mismo texto.
    expect(screen.getByTestId("hero-title")).toBe(tituloAntes);
    expect(tituloAntes.textContent).toBe("Tu portafolio en monitoreo");

    // Métricas rellenas en su sitio: proyectos/auditorías del publish de
    // página; uptime y alertas del publish live de OverviewTab.
    expect(screen.getByText("3")).toBeTruthy();
    // "2" también es el texto directo del <p> del gauge (cobertura 2/3),
    // así que aquí solo se exige que exista la tarjeta de auditorías.
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("99.5%")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("/3")).toBeTruthy();
  });

  it("las claves i18n del hero existen en ambos idiomas (paridad)", async () => {
    const es = (await import("../../../messages/es.json")).default;
    const en = (await import("../../../messages/en.json")).default;
    expect(es.overview.heroTitle).toBeTruthy();
    expect(en.overview.heroTitle).toBeTruthy();
    expect(es.overview.heroTitle).not.toBe(en.overview.heroTitle);
  });
});
