import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { TriageTab } from "./TriageTab";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";

function board(over: Record<string, unknown> = {}) {
  return {
    success: true,
    statuses: ["open", "acknowledged", "in_progress", "resolved", "false_positive", "accepted_risk"],
    transitions: {
      open: ["acknowledged"],
      acknowledged: ["open", "in_progress"],
      in_progress: ["acknowledged", "resolved", "false_positive", "accepted_risk"],
      resolved: [],
      false_positive: [],
      accepted_risk: [],
    },
    findings: [],
    ...over,
  };
}

const finding = {
  id: "f1",
  projectId: PROJECT_ID,
  title: "XSS reflejado en login",
  description: "El parámetro email refleja HTML sin escapar.",
  severity: "high",
  status: "open",
  assigneeId: null,
  slaHours: null,
  dueAt: null,
  acknowledgedAt: null,
  resolvedAt: null,
  suppressedUntil: null,
  suppressedReason: null,
  affectedAsset: "tienda.example.com",
  aiTriage: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  overdue: false,
};

const props = {
  initialProjects: [{ id: PROJECT_ID, name: "Proyecto A" }],
  selectedProjectId: PROJECT_ID,
  setSelectedProjectId: vi.fn(),
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockBoard(payload: unknown) {
  fetchMock.mockImplementation(async (url: string, opts?: { method?: string }) => {
    const method = opts?.method || "GET";
    if (typeof url === "string" && url.includes("/transition") && method === "POST") {
      return { ok: true, json: async () => ({ success: true, status: "acknowledged" }) };
    }
    if (typeof url === "string" && url.includes("/suppress") && method === "POST") {
      return { ok: true, json: async () => ({ success: true, suppressedUntil: "2026-11-01T00:00:00.000Z" }) };
    }
    return { ok: true, json: async () => payload };
  });
}

describe("TriageTab", () => {
  it("sin proyecto seleccionado no pide el tablero y no se queda cargando", async () => {
    // Regresión (encontrado navegando, no en tests): con cero proyectos el
    // <select> vale "" y el efecto hacía `return` temprano, dejando
    // `loadedFor` en null para siempre. El tab giraba en "Cargando tablero…"
    // en vez de mostrar el estado vacío.
    mockBoard(board());
    render(
      <TriageTab
        initialProjects={[]}
        selectedProjectId=""
        setSelectedProjectId={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("empty")).toBeTruthy();
    });
    expect(screen.queryByText("loading")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("muestra el estado vacío cuando no hay hallazgos", async () => {
    mockBoard(board());
    render(<TriageTab {...props} />);
    await waitFor(() => {
      expect(screen.getByText("empty")).toBeTruthy();
    });
  });

  it("renderiza el tablero con columnas, tarjeta y severidad", async () => {
    mockBoard(board({ findings: [finding] }));
    render(<TriageTab {...props} />);

    await waitFor(() => {
      expect(screen.getByText("XSS reflejado en login")).toBeTruthy();
    });
    expect(screen.getByText("columns.open")).toBeTruthy();
    expect(screen.getByText("columns.closed")).toBeTruthy();
    expect(screen.getByText("severity.high")).toBeTruthy();
    expect(screen.getByText("noSla")).toBeTruthy();
  });

  it("aplica una transición y recarga el tablero", async () => {
    mockBoard(board({ findings: [finding] }));
    render(<TriageTab {...props} />);

    await waitFor(() => {
      expect(screen.getByText("XSS reflejado en login")).toBeTruthy();
    });

    // Abrir el detalle de la tarjeta para ver sus acciones
    fireEvent.click(screen.getByText("XSS reflejado en login"));
    const acknowledge = await screen.findByText("actions.acknowledged");
    fireEvent.click(acknowledge);

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        (c) => typeof c[0] === "string" && c[0].includes("/transition"),
      );
      expect(posts.length).toBeGreaterThan(0);
    });
  });

  it("marca SLA vencido en una tarjeta overdue", async () => {
    mockBoard(board({ findings: [{ ...finding, status: "in_progress", overdue: true, dueAt: "2026-10-01T00:00:00.000Z" }] }));
    render(<TriageTab {...props} />);
    await waitFor(() => {
      expect(screen.getByText("overdue")).toBeTruthy();
    });
  });
});
