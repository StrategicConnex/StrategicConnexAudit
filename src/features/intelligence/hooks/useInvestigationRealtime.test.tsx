import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useInvestigationRealtime } from "./useInvestigationRealtime";

// ─── Mocks ──────────────────────────────────────────────────────────────────
// 1. Cliente Supabase: captura suscripciones postgres_changes y expone callbacks.
// 2. fetch: responde al fetch inicial de /api/intelligence/investigations.

interface Subscription {
  channelName: string;
  event: string;
  config: { event: string; schema: string; table: string; filter?: string };
  callback: (payload: unknown) => void;
}

const mockState = vi.hoisted(() => ({
  subscriptions: [] as Subscription[],
  removedChannels: [] as string[],
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (channelName: string) => {
      const channel = {
        channelName,
        on: (event: string, config: unknown, callback: (payload: unknown) => void) => {
          mockState.subscriptions.push({
            channelName,
            event,
            config: config as Subscription["config"],
            callback,
          });
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: (ch: { channelName: string }) => {
      mockState.removedChannels.push(ch.channelName);
    },
  }),
}));

function fire(table: string, event: string, row: Record<string, unknown>) {
  const sub = mockState.subscriptions.find(
    (s) => s.config.table === table && s.config.event === event
  );
  if (!sub) throw new Error(`No subscription for ${event} on ${table}`);
  act(() => {
    sub.callback({ new: row });
  });
}

function fetchOk(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      investigation: { id: "inv-A", title: "Inv A", status: "running" },
      findings: [],
      events: [],
      ...overrides,
    }),
  };
}

describe("useInvestigationRealtime — aislamiento multi-tenant", () => {
  beforeEach(() => {
    mockState.subscriptions = [];
    mockState.removedChannels = [];
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(fetchOk());
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("suscripciones con filtro tenant-scoped (investigation_id / id)", async () => {
    renderHook(() => useInvestigationRealtime("inv-A"));
    await act(async () => {
      await Promise.resolve();
    });

    const tables = mockState.subscriptions.map((s) => s.config.table).sort();
    expect(tables).toEqual([
      "intelligence_findings",
      "intelligence_investigations",
      "intelligence_run_events",
    ]);

    for (const sub of mockState.subscriptions) {
      expect(sub.config.schema).toBe("public");
      if (sub.config.table === "intelligence_investigations") {
        expect(sub.config.event).toBe("UPDATE");
        expect(sub.config.filter).toBe("id=eq.inv-A");
      } else {
        expect(sub.config.event).toBe("INSERT");
        expect(sub.config.filter).toBe("investigation_id=eq.inv-A");
      }
    }
  });

  it("sin investigationId no suscribe ni hace fetch", async () => {
    renderHook(() => useInvestigationRealtime(null));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockState.subscriptions).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("evento INSERT del propio tenant agrega a events", async () => {
    const { result } = renderHook(() => useInvestigationRealtime("inv-A"));
    await act(async () => {
      await Promise.resolve();
    });

    fire("intelligence_run_events", "INSERT", {
      id: "evt-1",
      investigation_id: "inv-A",
      event_type: "tool_start",
      message: "Ejecutando whois",
      created_at: "2026-08-08T10:00:00Z",
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].id).toBe("evt-1");
  });

  it("evento INSERT de OTRA investigación NO agrega a events", async () => {
    const { result } = renderHook(() => useInvestigationRealtime("inv-A"));
    await act(async () => {
      await Promise.resolve();
    });

    fire("intelligence_run_events", "INSERT", {
      id: "evt-x",
      investigation_id: "inv-B",
      event_type: "tool_start",
      message: "Evento de otro tenant",
      created_at: "2026-08-08T10:00:00Z",
    });

    expect(result.current.events).toHaveLength(0);
  });

  it("evento INSERT del propio tenant agrega a findings", async () => {
    const { result } = renderHook(() => useInvestigationRealtime("inv-A"));
    await act(async () => {
      await Promise.resolve();
    });

    fire("intelligence_findings", "INSERT", {
      id: "find-1",
      investigation_id: "inv-A",
      severity: "medium",
      title: "Hallazgo propio",
      created_at: "2026-08-08T10:00:00Z",
    });

    expect(result.current.findings).toHaveLength(1);
    expect(result.current.findings[0].id).toBe("find-1");
  });

  it("evento INSERT de OTRA investigación NO agrega a findings", async () => {
    const { result } = renderHook(() => useInvestigationRealtime("inv-A"));
    await act(async () => {
      await Promise.resolve();
    });

    fire("intelligence_findings", "INSERT", {
      id: "find-x",
      investigation_id: "inv-B",
      severity: "critical",
      title: "Datos de otro tenant",
      created_at: "2026-08-08T10:00:00Z",
    });

    expect(result.current.findings).toHaveLength(0);
  });

  it("UPDATE del propio tenant actualiza investigation", async () => {
    const { result } = renderHook(() => useInvestigationRealtime("inv-A"));
    await act(async () => {
      await Promise.resolve();
    });

    fire("intelligence_investigations", "UPDATE", {
      id: "inv-A",
      status: "completed",
      score: 85,
    });

    expect(result.current.investigation?.status).toBe("completed");
  });

  it("UPDATE de OTRA investigación NO actualiza investigation", async () => {
    const { result } = renderHook(() => useInvestigationRealtime("inv-A"));
    await act(async () => {
      await Promise.resolve();
    });

    fire("intelligence_investigations", "UPDATE", {
      id: "inv-B",
      status: "completed",
      score: 99,
    });

    expect(result.current.investigation?.status).not.toBe("completed");
  });

  it("dedupe: el mismo evento no se agrega dos veces", async () => {
    const { result } = renderHook(() => useInvestigationRealtime("inv-A"));
    await act(async () => {
      await Promise.resolve();
    });

    fire("intelligence_run_events", "INSERT", {
      id: "evt-1",
      investigation_id: "inv-A",
      event_type: "tool_start",
      message: "Duplicado",
      created_at: "2026-08-08T10:00:00Z",
    });
    fire("intelligence_run_events", "INSERT", {
      id: "evt-1",
      investigation_id: "inv-A",
      event_type: "tool_start",
      message: "Duplicado",
      created_at: "2026-08-08T10:00:00Z",
    });

    expect(result.current.events).toHaveLength(1);
  });

  it("cleanup remueve el canal y limpia el polling al desmontar", async () => {
    const { unmount } = renderHook(() => useInvestigationRealtime("inv-A"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockState.subscriptions.length).toBeGreaterThan(0);

    unmount();

    expect(mockState.removedChannels).toContain("investigation_realtime:inv-A");
    // El polling (setInterval 3000) no debe disparar más fetches tras el unmount
    const fetchCountAtUnmount = fetchMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(fetchMock.mock.calls.length).toBe(fetchCountAtUnmount);
  });
});
