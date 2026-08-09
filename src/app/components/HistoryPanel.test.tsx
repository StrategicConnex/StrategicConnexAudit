import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { HistoryPanel } from "./HistoryPanel";

const fetchMock = vi.hoisted(() => vi.fn());

const dnsResponse = {
  success: true,
  type: "dns",
  projectId: "p1",
  dns: {
    snapshots: [
      { recordType: "A", query: "example.com", value: "203.0.113.9", ttl: 3600, snapshotDate: "2026-01-01T00:00:00Z" },
      { recordType: "MX", query: "example.com", value: "mail.example.com", ttl: null, snapshotDate: "2026-01-02T00:00:00Z" },
    ],
    totalCount: 45,
    firstSeen: "2025-12-01T00:00:00Z",
    lastSeen: "2026-01-02T00:00:00Z",
    changeCount: 2,
  },
  whois: null,
  timeline: null,
};

const whoisResponse = {
  success: true,
  type: "whois",
  projectId: "p1",
  dns: null,
  whois: {
    snapshots: [
      {
        domain: "expired.com",
        registrar: null,
        createdDate: "2020-01-01T00:00:00Z",
        expiresDate: "2025-01-01T00:00:00Z",
        updatedDate: null,
        status: ["active"],
        nameservers: [],
        abuseContact: null,
        registrantOrg: null,
        diffSummary: null,
        snapshotDate: "2026-01-01T00:00:00Z",
      },
      {
        domain: "soon.com",
        registrar: "Namecheap",
        createdDate: "2021-01-01T00:00:00Z",
        expiresDate: new Date(Date.now() + 20 * 86400000).toISOString(),
        updatedDate: null,
        status: ["active"],
        nameservers: ["ns1.namecheap.com", "ns2.namecheap.com"],
        abuseContact: "abuse@namecheap.com",
        registrantOrg: "ACME Corp",
        diffSummary: "Cambio de registrador detectado",
        snapshotDate: "2026-01-01T00:00:00Z",
      },
    ],
    totalCount: 2,
    firstSeen: "2025-12-01T00:00:00Z",
    lastSeen: "2026-01-02T00:00:00Z",
    changeCount: 1,
  },
  timeline: null,
};

const timelineResponse = {
  success: true,
  type: "timeline",
  projectId: "p1",
  dns: null,
  whois: null,
  timeline: {
    dnsChanges: [
      {
        type: "changed", recordType: "A", query: "example.com",
        previousValue: "1.1.1.1", currentValue: "2.2.2.2",
        detectedAt: "2026-01-01T00:00:00Z", source: "dns",
      },
    ],
    whoisChanges: [
      {
        field: "registrar", label: "Registrador",
        previousValue: "GoDaddy", currentValue: "Namecheap",
        severity: "critical", detectedAt: "2026-01-01T00:00:00Z", source: "whois",
      },
    ],
    totalChanges: 2,
    fromDate: "2025-12-01T00:00:00Z",
    toDate: "2026-01-02T00:00:00Z",
  },
};

function mockFetchOnce(payload: unknown) {
  fetchMock.mockImplementation(async (url: string) => {
    const type = url.includes("type=whois") ? "whois" : url.includes("type=timeline") ? "timeline" : "dns";
    const body = type === "whois" ? whoisResponse : type === "timeline" ? timelineResponse : dnsResponse;
    return { ok: true, json: async () => payload ?? body };
  });
}

describe("HistoryPanel — historial DNS/WHOIS con fetch mockeado", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra el estado de carga mientras llega la respuesta", () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // nunca resuelve
    render(<HistoryPanel projectId="p1" />);
    expect(screen.getByText(/Cargando historial/i)).toBeTruthy();
  });

  it("renderiza snapshots DNS y expande el detalle al hacer clic", async () => {
    mockFetchOnce(null);
    render(<HistoryPanel projectId="p1" />);

    await waitFor(() => {
      expect(screen.getByText("203.0.113.9")).toBeTruthy();
    });
    expect(screen.getAllByText("example.com").length).toBe(2);

    fireEvent.click(screen.getByText("203.0.113.9").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText("3600s")).toBeTruthy();
    });
    // Colapsar de nuevo → el detalle desaparece (el valor ahora aparece 2 veces)
    fireEvent.click(screen.getAllByText("203.0.113.9")[0].closest("button")!);
    await waitFor(() => {
      expect(screen.queryByText("3600s")).toBeNull();
    });
  });

  it("muestra 'Mostrando 30 de 45' cuando totalCount > 30", async () => {
    mockFetchOnce(null);
    render(<HistoryPanel projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByText(/Mostrando 30 de 45/)).toBeTruthy();
    });
  });

  it("pestaña WHOIS: dominio expirado muestra badge EXPIRADO y fallback de registrador", async () => {
    mockFetchOnce(null);
    render(<HistoryPanel projectId="p1" />);

    fireEvent.click(screen.getByText("WHOIS"));
    await waitFor(() => {
      expect(screen.getByText("EXPIRADO")).toBeTruthy();
    });
    expect(screen.getByText("Registrador desconocido")).toBeTruthy();
  });

  it("pestaña WHOIS: dominio a 20 días y detalle completo (nameservers, diff, abuso)", async () => {
    mockFetchOnce(null);
    render(<HistoryPanel projectId="p1" />);

    fireEvent.click(screen.getByText("WHOIS"));
    await waitFor(() => {
      expect(screen.getByText("20d")).toBeTruthy();
    });
    expect(screen.getByText("CAMBIO")).toBeTruthy();

    fireEvent.click(screen.getByText("soon.com").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText("ACME Corp")).toBeTruthy();
      expect(screen.getByText("ns1.namecheap.com")).toBeTruthy();
      expect(screen.getByText(/Cambio de registrador detectado/)).toBeTruthy();
      expect(screen.getByText(/abuse@namecheap.com/)).toBeTruthy();
    });
  });

  it("pestaña WHOIS: detalle de dominio expirado muestra 'Sin nameservers' y '/''", async () => {
    mockFetchOnce(null);
    render(<HistoryPanel projectId="p1" />);

    fireEvent.click(screen.getByText("WHOIS"));
    await waitFor(() => {
      expect(screen.getByText("EXPIRADO")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("expired.com").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText("Sin nameservers")).toBeTruthy();
    });
  });

  it("pestaña Timeline: renderiza cambios DNS y WHOIS con severidades", async () => {
    mockFetchOnce(null);
    render(<HistoryPanel projectId="p1" />);

    fireEvent.click(screen.getByText("Timeline"));
    await waitFor(() => {
      expect(screen.getByText("2.2.2.2")).toBeTruthy();
    });
    expect(screen.getByText("1.1.1.1")).toBeTruthy();
    expect(screen.getByText(/cambios entre/)).toBeTruthy();
    expect(screen.getByText(/Registrador/)).toBeTruthy();
  });

  it("pestaña Timeline sin timeline (sin query) muestra el estado de ayuda", async () => {
    mockFetchOnce({ success: true, type: "timeline", projectId: "p1", dns: null, whois: null, timeline: null });
    render(<HistoryPanel projectId="p1" />);

    fireEvent.click(screen.getByText("Timeline"));
    await waitFor(() => {
      expect(screen.getByText(/Ingresá un dominio/)).toBeTruthy();
    });
  });

  it("pestaña Timeline con 0 cambios muestra 'Sin cambios detectados'", async () => {
    mockFetchOnce({
      success: true, type: "timeline", projectId: "p1", dns: null, whois: null,
      timeline: { dnsChanges: [], whoisChanges: [], totalChanges: 0, fromDate: "2025-12-01T00:00:00Z", toDate: "2026-01-02T00:00:00Z" },
    });
    render(<HistoryPanel projectId="p1" />);

    fireEvent.click(screen.getByText("Timeline"));
    await waitFor(() => {
      expect(screen.getByText("Sin cambios detectados")).toBeTruthy();
    });
  });

  it("timeline: cambio DNS sin valor previo muestra '(nuevo)'", async () => {
    mockFetchOnce({
      success: true, type: "timeline", projectId: "p1", dns: null, whois: null,
      timeline: {
        dnsChanges: [
          { type: "added", recordType: "TXT", query: "example.com", previousValue: null, currentValue: "v=spf1 -all", detectedAt: "2026-01-01T00:00:00Z", source: "dns" },
        ],
        whoisChanges: [
          { field: "nameservers", label: "Nameservers", previousValue: "ns1.com", currentValue: "ns2.com", severity: "warning", detectedAt: "2026-01-01T00:00:00Z", source: "whois" },
        ],
        totalChanges: 2, fromDate: "2025-12-01T00:00:00Z", toDate: "2026-01-02T00:00:00Z",
      },
    });
    render(<HistoryPanel projectId="p1" />);

    fireEvent.click(screen.getByText("Timeline"));
    await waitFor(() => {
      expect(screen.getByText("(nuevo)")).toBeTruthy();
      expect(screen.getByText("Nameservers")).toBeTruthy();
    });
  });

  it("DNS: snapshot sin TTL muestra 'N/A' al expandir", async () => {
    mockFetchOnce(null);
    render(<HistoryPanel projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByText("mail.example.com")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("mail.example.com").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText("N/A")).toBeTruthy();
    });
  });

  it("pestaña WHOIS sin snapshots muestra estado vacío", async () => {
    mockFetchOnce({ success: true, type: "whois", projectId: "p1", dns: null, whois: { snapshots: [], totalCount: 0, firstSeen: null, lastSeen: null, changeCount: 0 }, timeline: null });
    render(<HistoryPanel projectId="p1" />);

    fireEvent.click(screen.getByText("WHOIS"));
    await waitFor(() => {
      expect(screen.getByText(/No hay snapshots WHOIS/)).toBeTruthy();
    });
  });

  it("el botón de limpiar búsqueda aparece al escribir y limpia el input", async () => {
    mockFetchOnce(null);
    render(<HistoryPanel projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Filtrar por dominio/)).toBeTruthy();
    });

    const input = screen.getByPlaceholderText(/Filtrar por dominio/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "example.com" } });
    const clearBtn = screen.getByLabelText("Limpiar búsqueda");
    expect(clearBtn).toBeTruthy();

    fireEvent.click(clearBtn);
    expect((screen.getByPlaceholderText(/Filtrar por dominio/) as HTMLInputElement).value).toBe("");
  });

  it("error de la API (success=false) muestra mensaje de error", async () => {
    mockFetchOnce({ success: false, type: "dns", projectId: "p1", dns: null, whois: null, timeline: null });
    render(<HistoryPanel projectId="p1" />);

    await waitFor(() => {
      expect(screen.getByText("Error al cargar historial")).toBeTruthy();
    });
  });

  it("error de red muestra mensaje de conexión", async () => {
    fetchMock.mockRejectedValue(new Error("failed to fetch"));
    render(<HistoryPanel projectId="p1" />);

    await waitFor(() => {
      expect(screen.getByText(/Error de conexión/)).toBeTruthy();
    });
  });

  it("sin snapshots DNS muestra estado vacío", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ success: true, type: "dns", projectId: "p1", dns: { snapshots: [], totalCount: 0, firstSeen: null, lastSeen: null, changeCount: 0 }, whois: null, timeline: null }),
    }));
    render(<HistoryPanel projectId="p1" />);

    await waitFor(() => {
      expect(screen.getByText(/No hay registros DNS histricos/)).toBeTruthy();
    });
  });

  it("onClose renderiza el botón Cerrar y lo dispara", async () => {
    mockFetchOnce(null);
    const onClose = vi.fn();
    render(<HistoryPanel projectId="p1" onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Cerrar historial")).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText("Cerrar historial"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
