import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MonitoringTab } from "./MonitoringTab";

const fetchMock = vi.hoisted(() => vi.fn());
const clipboardMock = vi.hoisted(() => ({ writeText: vi.fn(async () => {}) }));
const alertMock = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function mockApis(over: Record<string, unknown> = {}) {
  fetchMock.mockImplementation(async (url: string, opts?: { method?: string }) => {
    const method = opts?.method || "GET";
    if (url.startsWith("/api/monitoring") && method === "GET") {
      return {
        ok: true,
        json: async () => over.monitoring ?? {
          success: true,
          schedule: { enabled: true, interval: "weekly", lastRunAt: null, nextRunAt: new Date(Date.now() + 86400000).toISOString() },
          alerts: [],
        },
      };
    }
    if (url.startsWith("/api/monitoring") && method === "POST") {
      return {
        ok: true,
        json: async () => over.savedSchedule ?? { success: true, schedule: { enabled: true, interval: "daily", lastRunAt: null, nextRunAt: null } },
      };
    }
    if (url.startsWith("/api/webhooks")) {
      if (method === "POST") {
        return { ok: true, json: async () => over.createdWebhook ?? { success: true, webhook: { id: "w-new", name: "Test Webhook", url: "https://hook.example.com" } } };
      }
      if (method === "DELETE") {
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => over.webhooks ?? { success: true, webhooks: [] } };
    }
    if (url.startsWith("/api/api-keys")) {
      if (method === "POST") {
        return { ok: true, json: async () => over.createdKey ?? { success: true, apiKey: { id: "k-new", name: "CI Key", keyPrefix: "sa_live_ab12cd34" }, clearKey: "sa_live_clear_key_xyz" } };
      }
      if (method === "DELETE") {
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => over.apiKeys ?? { success: true, apiKeys: [] } };
    }
    if (url.startsWith("/api/bulk-scan")) {
      return { ok: true, json: async () => over.bulk ?? { success: true, message: "2 dominios añadidos a la cola" } };
    }
    return { ok: true, json: async () => ({ success: false }) };
  });
}

const props = {
  initialProjects: [{ id: "p1", name: "Proyecto A" }, { id: "p2", name: "Proyecto B" }],
  selectedProjectId: "p1",
  setSelectedProjectId: vi.fn(),
};

describe("MonitoringTab — schedule, webhooks, API keys, bulk scan y planes", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("alert", alertMock);
    alertMock.mockReset();
    Object.defineProperty(navigator, "clipboard", { value: clipboardMock, configurable: true });
    clipboardMock.writeText.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renderiza el schedule, selector de proyecto y planes", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);

    await waitFor(() => {
      expect(screen.getByText("pageTitle")).toBeTruthy();
    });
    expect(screen.getByText("Proyecto A")).toBeTruthy();
    expect(screen.getByText("Plan business")).toBeTruthy();
    // El nextRunAt del schedule se muestra
    await waitFor(() => {
      expect(screen.getByText(/scheduleNextRunLabel/)).toBeTruthy();
    });
  });

  it("renderiza alertas con severidades distintas y botón resolver para no resueltas", async () => {
    mockApis({
      monitoring: {
        success: true,
        schedule: { enabled: true, interval: "weekly", lastRunAt: null, nextRunAt: null },
        alerts: [
          { id: "a1", title: "Alerta crítica", message: "incidente", severity: "critical", resolved: false, createdAt: new Date().toISOString() },
          { id: "a2", title: "Alerta warning", message: "drift", severity: "warning", resolved: true, createdAt: new Date().toISOString() },
          { id: "a3", title: "Alerta info", message: "deploy", severity: "info", resolved: true, createdAt: new Date().toISOString() },
        ],
      },
    });
    render(<MonitoringTab {...props} />);

    await waitFor(() => {
      expect(screen.getByText("Alerta crítica")).toBeTruthy();
    });
    expect(screen.getByText("Alerta warning")).toBeTruthy();
    expect(screen.getByText("Alerta info")).toBeTruthy();
    expect(screen.getAllByText("critical").length).toBeGreaterThan(0);
    // Solo la alerta no resuelta tiene botón resolver
    expect(screen.getByText("driftResolveButton")).toBeTruthy();

    // Resolver la alerta → el botón desaparece
    fireEvent.click(screen.getByText("driftResolveButton"));
    await waitFor(() => {
      expect(screen.queryByText("driftResolveButton")).toBeNull();
    });
  });

  it("muestra los estados vacíos de alerts, webhooks y api keys", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);

    await waitFor(() => {
      expect(screen.getByText("driftEmpty")).toBeTruthy();
    });
    expect(screen.getByText("webhookEmpty")).toBeTruthy();
    expect(screen.getByText("apiKeysEmpty")).toBeTruthy();
  });

  it("guarda el schedule y añade una alerta simulada", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);
    await waitFor(() => {
      expect(screen.getByText("scheduleUpdateButton")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("scheduleUpdateButton"));

    await waitFor(() => {
      expect(screen.getByText(/Configuración Guardada/)).toBeTruthy();
    });
  });

  it("crea un webhook y lo añade a la lista", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("webhookNamePlaceholder")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("webhookNamePlaceholder"), { target: { value: "Mi Hook" } });
    fireEvent.change(screen.getByPlaceholderText("webhookUrlPlaceholder"), { target: { value: "https://hook.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "" })); // botón + (sin texto)

    await waitFor(() => {
      expect(screen.getByText("Test Webhook")).toBeTruthy();
    });
  });

  it("crea una API key, muestra el clearKey y copia al portapapeles", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("apiKeysNamePlaceholder")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("apiKeysNamePlaceholder"), { target: { value: "CI Key" } });
    fireEvent.click(screen.getByText("apiKeysGenerateButton"));

    await waitFor(() => {
      expect(screen.getByText("sa_live_clear_key_xyz")).toBeTruthy();
    });
    // Botón de copiar (Copy) → clipboard (el último botón sin nombre; el + del webhook está antes)
    const emptyButtons = screen.getAllByRole("button", { name: "" });
    fireEvent.click(emptyButtons![emptyButtons.length - 1]);
    expect(clipboardMock.writeText).toHaveBeenCalledWith("sa_live_clear_key_xyz");
  });

  it("bulk scan: sin dominios muestra error de validación", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("bulkPlaceholder")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("bulkPlaceholder"), { target: { value: "   \n  " } });
    fireEvent.click(screen.getByText("bulkProcessButton"));

    await waitFor(() => {
      expect(screen.getByText(/Introduce al menos un dominio/)).toBeTruthy();
    });
  });

  it("bulk scan: más de 10 dominios muestra error de límite", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("bulkPlaceholder")).toBeTruthy();
    });

    const many = Array.from({ length: 11 }, (_, i) => `d${i}.com`).join("\n");
    fireEvent.change(screen.getByPlaceholderText("bulkPlaceholder"), { target: { value: many } });
    fireEvent.click(screen.getByText("bulkProcessButton"));

    await waitFor(() => {
      expect(screen.getByText(/máximo 10 dominios/)).toBeTruthy();
    });
  });

  it("bulk scan válido: encola y muestra mensaje de éxito", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("bulkPlaceholder")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("bulkPlaceholder"), { target: { value: "a.com\nb.com" } });
    fireEvent.click(screen.getByText("bulkProcessButton"));

    await waitFor(() => {
      expect(screen.getByText("2 dominios añadidos a la cola")).toBeTruthy();
    });
  });

  it("abre el modal de planes y selecciona el plan starter", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);
    await waitFor(() => {
      expect(screen.getByText("quotaUpgradeButton")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("quotaUpgradeButton"));
    await waitFor(() => {
      expect(screen.getByText("pricingTitle")).toBeTruthy();
    });
    // Plan actual = business → solo starter y enterprise dicen 'planSelect' (2); business dice 'planActive'
    const selectButtons = screen.getAllByText("planSelect");
    expect(selectButtons.length).toBe(2);
    expect(screen.getAllByText("planActive").length).toBe(1);

    fireEvent.click(selectButtons![0]); // Starter
    await waitFor(() => {
      expect(screen.queryByText("pricingTitle")).toBeNull(); // modal cerrado
    });
    expect(screen.getByText("Plan starter")).toBeTruthy();
  });

  it("triggerSlackTest añade alerta y llama al alert nativo", async () => {
    mockApis();
    render(<MonitoringTab {...props} />);
    await waitFor(() => {
      expect(screen.getByText("slackTestButton")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("slackTestButton"));
    expect(alertMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/Slack Alert Test Dispatched/)).toBeTruthy();
    });
  });
});
