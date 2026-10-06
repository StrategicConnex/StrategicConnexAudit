import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PortfolioTab } from "./PortfolioTab";

/**
 * El tab de portafolio es donde una cifra "~0%" es indistinguible de un "no
 * hay datos" si la UI no hace el trabajo. Estos tests fijan que los `null` del
 * servidor lleguen a pantalla como "sin datos", nunca como 0.
 */

// `useTranslations('portfolio')` devuelve un fn que recibe la clave RELATIVA
// al namespace; se le antepone el namespace para que los asertos puedan
// escribir la ruta completa (`portfolio.empty`) y no depender de la copia.
vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, unknown>) => {
      const full = `${namespace}.${key}`;
      return values ? `${full}:${Object.values(values).join(",")}` : full;
    },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), security: vi.fn(), info: vi.fn() },
}));

const PROJECTS = [{ id: "p1", name: "ACME", domain: "acme.test" }];

const emptyPortfolio = {
  corporateScore: null,
  projectCount: 0,
  projectsWithoutData: 0,
  totalCriticalIssues: 0,
  totalWarningIssues: 0,
  totalOpenFindings: 0,
  totalOpenCritical: 0,
  mttrHours: null,
  worstProjects: [],
  projects: [],
  openBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
};

const emptyTrends = {
  points: [],
  uptime: [],
  latestScore: null,
  scoreDelta: null,
  direction: "unknown" as const,
  resolvedInWindow: 0,
  stillOpen: 0,
  uptimePct: null,
  coverage: { buckets: 0, withScore: 0, withUptime: 0 },
};

const emptyPurple = {
  current: {
    detectionScore: null,
    missRate: null,
    evaluated: 0,
    exposed: 0,
    protected: 0,
    manualOnly: 0,
    errors: 0,
    runs: 0,
    detected: 0,
    missed: 0,
    runErrors: 0,
    byTechnique: [],
    blindSpots: [],
  },
  previous: emptyTrends && {
    detectionScore: null,
    missRate: null,
    evaluated: 0,
    exposed: 0,
    protected: 0,
    manualOnly: 0,
    errors: 0,
    runs: 0,
    detected: 0,
    missed: 0,
    runErrors: 0,
    byTechnique: [],
    blindSpots: [],
  },
  deltaPoints: null,
  direction: "unknown" as const,
  hasPreviousData: false,
};

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, ...(data as object) }) });
}

function renderTab() {
  return render(
    <PortfolioTab projects={PROJECTS} selectedProjectId="p1" setSelectedProjectId={vi.fn()} />,
  );
}

describe("PortfolioTab", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/portfolio/trends")) return ok({ trends: emptyTrends });
        if (url.startsWith("/api/portfolio/purple-score")) return ok({ purple: emptyPurple });
        return ok({ portfolio: emptyPortfolio });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("muestra 'sin datos' cuando no hay ningún proyecto", async () => {
    renderTab();
    expect(await screen.findByText("portfolio.empty")).toBeInTheDocument();
    expect(screen.getByText("portfolio.corporateScore")).toBeInTheDocument();
    // El score null no se pinta como 0.
    expect(screen.getByText("portfolio.noData")).toBeInTheDocument();
  });

  it("pide las tres fuentes en paralelo", async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText("portfolio.empty")).toBeInTheDocument());
    const urls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(urls).toContain("/api/portfolio");
    expect(urls.some((u: string) => u.includes("/api/portfolio/trends?projectId=p1"))).toBe(true);
    expect(urls.some((u: string) => u.includes("/api/portfolio/purple-score?projectId=p1"))).toBe(true);
  });

  it("una cartera con datos muestra score corporativo y peor postura", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/portfolio/trends")) {
          return ok({
            trends: {
              ...emptyTrends,
              points: [
                { bucketStart: "2026-10-01T00:00:00.000Z", audits: 1, score: 90, criticalIssues: 0, warningIssues: 2, resolved: 1, mttrHours: 4 },
                { bucketStart: "2026-10-08T00:00:00.000Z", audits: 1, score: 70, criticalIssues: 2, warningIssues: 0, resolved: 0, mttrHours: null },
              ],
              latestScore: 70,
              scoreDelta: -20,
              direction: "down",
              resolvedInWindow: 1,
              stillOpen: 3,
            },
          });
        }
        if (url.startsWith("/api/portfolio/purple-score")) {
          return ok({
            purple: {
              ...emptyPurple,
              current: { ...emptyPurple.current, detectionScore: 25, evaluated: 4, exposed: 1, blindSpots: ["T1190"] },
              deltaPoints: -10,
              direction: "down",
              hasPreviousData: true,
            },
          });
        }
        return ok({
          portfolio: {
            ...emptyPortfolio,
            corporateScore: 70,
            projectCount: 1,
            projectsWithoutData: 0,
            totalOpenFindings: 3,
            totalOpenCritical: 1,
            mttrHours: 4,
            worstProjects: [
              { id: "p1", name: "ACME", domain: "acme.test", healthScore: 70, criticalIssues: 2, warningIssues: 0, openFindings: 3, openCritical: 1, closedFindings: 1, mttrHours: 4, lastAuditAt: "2026-10-08T00:00:00.000Z" },
            ],
          },
        });
      }),
    );

    renderTab();
    expect(await screen.findByText("portfolio.worstTitle")).toBeInTheDocument();
    // "ACME" aparece también en el <select> de proyectos: se busca el heading.
    expect(screen.getByRole("heading", { name: "portfolio.worstTitle" })).toBeInTheDocument();
    expect(screen.getByText("portfolio.purpleTitle")).toBeInTheDocument();
    // El punto ciego se enuncia con su ID de técnica.
    expect(screen.getByText("T1190")).toBeInTheDocument();
    expect(screen.getByText("portfolio.blindSpots:1")).toBeInTheDocument();
  });

  it("un bucket sin score no inventa un cero en la serie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/portfolio/trends")) {
          return ok({
            trends: {
              ...emptyTrends,
              points: [{ bucketStart: "2026-10-01T00:00:00.000Z", audits: 0, score: null, criticalIssues: 0, warningIssues: 0, resolved: 0, mttrHours: null }],
            },
          });
        }
        return ok({ portfolio: { ...emptyPortfolio, projectCount: 1 }, purple: emptyPurple });
      }),
    );

    renderTab();
    await waitFor(() => expect(screen.getByText("portfolio.noTrendData")).toBeInTheDocument());
  });

  it("sin histórico comparable dice 'sin histórico', no delta 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/portfolio/trends")) return ok({ trends: emptyTrends });
        if (url.startsWith("/api/portfolio/purple-score")) {
          return ok({
            purple: {
              ...emptyPurple,
              current: { ...emptyPurple.current, detectionScore: 40, evaluated: 5, exposed: 2 },
              deltaPoints: null,
              direction: "unknown",
              hasPreviousData: false,
            },
          });
        }
        return ok({ portfolio: { ...emptyPortfolio, projectCount: 1 } });
      }),
    );

    renderTab();
    expect(await screen.findByText("portfolio.noTrend")).toBeInTheDocument();
    expect(screen.getByText("portfolio.purpleScore")).toBeInTheDocument();
  });

  it("cambio de agrupación vuelve a pedir la serie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/portfolio/trends")) return ok({ trends: emptyTrends });
        if (url.startsWith("/api/portfolio/purple-score")) return ok({ purple: emptyPurple });
        return ok({ portfolio: { ...emptyPortfolio, projectCount: 1, corporateScore: 80 } });
      }),
    );

    renderTab();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "portfolio.buckets.day" })).toBeInTheDocument(),
    );
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const before = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "portfolio.buckets.day" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c: string[]) => c[0].includes("bucket=day")),
      ).toBe(true),
    );
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("fallo de red muestra ErrorState con acción de reintento", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    renderTab();

    expect(await screen.findByText("portfolio.errorTitle")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // El reintento vuelve a pedir las tres fuentes.
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("enseña los simulacros del adversario aunque no haya evaluaciones de técnica", async () => {
    // Regresión: el panel se ocultaba entero con `evaluated > 0`, así que
    // 4 simulacros 'missed' (missRate 100%) quedaban invisibles sin
    // evaluaciones. El miss rate es la cifra más urgente del panel.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/portfolio/trends")) return ok({ trends: emptyTrends });
        if (url.startsWith("/api/portfolio/purple-score")) {
          return ok({
            purple: {
              ...emptyPurple,
              current: {
                ...emptyPurple.current,
                evaluated: 0,
                exposed: 0,
                detectionScore: null,
                missRate: 100,
                runs: 4,
                detected: 0,
                missed: 4,
              },
            },
          });
        }
        return ok({ portfolio: { ...emptyPortfolio, projectCount: 1, corporateScore: 80 } });
      }),
    );

    renderTab();

    // El panel aparece porque hay evidencia (runs > 0).
    expect(await screen.findByText("portfolio.purpleTitle")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("portfolio.purpleMissRate")).toBeInTheDocument();
    expect(screen.getByText("portfolio.purpleRuns")).toBeInTheDocument();
    // Y explica por qué no hay score de detección.
    expect(screen.getByText("portfolio.purpleNoEvaluations")).toBeInTheDocument();
    // El score de detección sin evidencia es guion, no 0%.
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("sin ninguna evidencia ni simulacros muestra el estado vacío", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/portfolio/trends")) return ok({ trends: emptyTrends });
        if (url.startsWith("/api/portfolio/purple-score")) return ok({ purple: emptyPurple });
        return ok({ portfolio: { ...emptyPortfolio, projectCount: 1, corporateScore: 80 } });
      }),
    );

    renderTab();
    expect(await screen.findByText("portfolio.purpleTitle")).toBeInTheDocument();
    expect(screen.getByText("portfolio.purpleEmpty")).toBeInTheDocument();
  });

  it("sin proyecto seleccionado no pide series y no se queda cargando", async () => {
    // Regresión: el efecto hacía `return` temprano sin proyecto, así que el
    // `finally` no corría, el estado de carga no terminaba nunca y el tab
    // giraba indefinidamente. El roll-up de cartera no necesita proyecto.
    render(
      <PortfolioTab projects={[]} selectedProjectId="" setSelectedProjectId={vi.fn()} />,
    );

    expect(await screen.findByText("portfolio.empty")).toBeInTheDocument();
    expect(screen.queryByText("portfolio.loading")).not.toBeInTheDocument();

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain("/api/portfolio");
    expect(urls.some((u: string) => u.includes("/api/portfolio/trends"))).toBe(false);
    expect(urls.some((u: string) => u.includes("purple-score"))).toBe(false);
  });

  it("respuesta sin success muestra ErrorState sin romperse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false, error: "boom" }) })),
    );

    renderTab();
    expect(await screen.findByText("portfolio.errorTitle")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});