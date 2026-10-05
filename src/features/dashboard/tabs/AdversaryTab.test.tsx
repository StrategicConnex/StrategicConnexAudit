import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { AdversaryTab } from "./AdversaryTab";

const fetchMock = vi.hoisted(() => vi.fn());

// `fetchScenarios` depende de `t` en su useCallback. Si el mock devuelve una
// función nueva en cada render, `t` cambia de identidad, el useEffect se
// re-dispara en bucle y el worker de vitest se queda colgado. La identidad debe
// ser estable, y `vi.mock` se hoistea: la constante vive dentro del factory.
vi.mock("next-intl", () => {
  const stableT = (key: string) => key;
  return { useTranslations: () => stableT };
});

// Los dos hijos reales arrancan un `setInterval` de polling que mantiene vivo el
// worker de vitest. Se aíslan aquí porque esta regresión es de `AdversaryTab`.
vi.mock("./RealAssessmentSection", () => ({
  RealAssessmentSection: () => <div data-testid="real-assessment" />,
}));

vi.mock("./MitreRealCoverage", () => ({
  MitreRealCoverage: () => <div data-testid="mitre-coverage" />,
}));

const CATALOG = [
  {
    mitreId: "T1078.001",
    tactic: "TA0001",
    technique: "Default Accounts",
    name: "Default Credential Access Simulation",
    description: "Simula intento de acceso con credenciales por defecto.",
    detectionAdvice: "Monitorear logs de autenticación.",
    prerequisites: [],
    severity: "high",
    tags: ["credential-access"],
    executorCommand: "echo test",
    totalRuns: 0,
    detectedCount: 0,
  },
];

describe("AdversaryTab — carga de escenarios", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, catalog: CATALOG }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sin proyecto seleccionado apaga el spinner y no se queda colgado", async () => {
    // Regresión: `loading` arrancaba en true y el `if (!projectId) return;`
    // temprano salía sin apagarlo, así que la pestaña mostraba "Cargando
    // escenarios" indefinidamente, sin contenido ni mensaje de error.
    render(
      <AdversaryTab
        projectId=""
        initialProjects={[{ id: "p1", name: "Alfa", domain: "alfa.test" }]}
      />
    );

    // Sin proyecto no se pide nada al servidor…
    await waitFor(() => {
      // Con proyectos cargados se muestra el selector, aunque ninguno esté elegido.
      expect(screen.getByText("activeProject")).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // …y el spinner se apaga: la interfaz queda utilizable, no en bucle de carga.
    expect(screen.queryByText("loading")).toBeNull();
  });

  it("con proyecto seleccionado pide el catálogo y lista los escenarios", async () => {
    render(<AdversaryTab projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText("Default Credential Access Simulation")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/intelligence/adversary?projectId=proj-1");
  });
});
