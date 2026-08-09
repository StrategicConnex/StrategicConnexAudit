import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useRealtimeMetrics } from "../hooks/useRealtimeMetrics";

// ─── Mock del cliente Supabase ──────────────────────────────────────────────
// Captura las suscripciones postgres_changes (config con filtros) y expone los
// callbacks para simular eventos del servidor (incl. cross-tenant).
interface Subscription {
  channelName: string;
  event: string;
  config: { event: string; schema: string; table: string; filter?: string };
  callback: (payload: unknown) => void;
}

const mockState = vi.hoisted(() => ({
  subscriptions: [] as Subscription[],
  removedChannels: [] as string[],
  clientUrl: "",
  clientKey: "",
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (url: string, key: string) => {
    mockState.clientUrl = url;
    mockState.clientKey = key;
    return {
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
    };
  },
}));

function fireInsert(table: string, row: Record<string, unknown>) {
  const sub = mockState.subscriptions.find(
    (s) => s.config.table === table && s.config.event === "INSERT"
  );
  if (!sub) throw new Error(`No subscription for INSERT on ${table}`);
  act(() => {
    sub.callback({ new: row });
  });
}

describe("useRealtimeMetrics — aislamiento multi-tenant", () => {
  beforeEach(() => {
    mockState.subscriptions = [];
    mockState.removedChannels = [];
    mockState.clientUrl = "";
    mockState.clientKey = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("suscripciones con filtro tenant-scoped (project_id=eq.<proyecto>)", () => {
    renderHook(() => useRealtimeMetrics("proj-A"));

    expect(mockState.subscriptions).toHaveLength(2);
    const tables = mockState.subscriptions.map((s) => s.config.table).sort();
    expect(tables).toEqual(["intelligence_assets", "intelligence_findings"]);

    for (const sub of mockState.subscriptions) {
      expect(sub.config.schema).toBe("public");
      expect(sub.config.event).toBe("INSERT");
      expect(sub.config.filter).toBe("project_id=eq.proj-A");
    }
  });

  it("sin projectId no suscribe (no hay filtro que exponer)", () => {
    renderHook(() => useRealtimeMetrics(undefined));
    expect(mockState.subscriptions).toHaveLength(0);
  });

  it("evento INSERT del propio tenant actualiza latestFinding", () => {
    const { result } = renderHook(() => useRealtimeMetrics("proj-A"));

    fireInsert("intelligence_findings", {
      project_id: "proj-A",
      severity: "high",
      title: "Subdominio expuesto",
      created_at: "2026-08-08T10:00:00Z",
    });

    expect(result.current.latestFinding).toEqual({
      severity: "high",
      title: "Subdominio expuesto",
      createdAt: "2026-08-08T10:00:00Z",
    });
  });

  it("evento INSERT de OTRO tenant (proj-B) NO actualiza latestFinding", () => {
    const { result } = renderHook(() => useRealtimeMetrics("proj-A"));

    fireInsert("intelligence_findings", {
      project_id: "proj-B",
      severity: "critical",
      title: "Datos de otro cliente",
      created_at: "2026-08-08T10:00:00Z",
    });

    expect(result.current.latestFinding).toBeNull();
  });

  it("evento INSERT del propio tenant incrementa assetsDiscovered", () => {
    const { result } = renderHook(() => useRealtimeMetrics("proj-A"));

    fireInsert("intelligence_assets", { project_id: "proj-A", asset_type: "subdomain" });
    fireInsert("intelligence_assets", { project_id: "proj-A", asset_type: "ip" });

    expect(result.current.assetsDiscovered).toBe(2);
  });

  it("evento INSERT de OTRO tenant NO incrementa assetsDiscovered", () => {
    const { result } = renderHook(() => useRealtimeMetrics("proj-A"));

    fireInsert("intelligence_assets", { project_id: "proj-B", asset_type: "subdomain" });
    fireInsert("intelligence_assets", { project_id: "proj-B", asset_type: "ip" });

    expect(result.current.assetsDiscovered).toBe(0);
  });

  it("cambio de projectId re-suscribe con el nuevo filtro", () => {
    const { rerender } = renderHook(({ pid }) => useRealtimeMetrics(pid), {
      initialProps: { pid: "proj-A" },
    });

    expect(mockState.subscriptions.every((s) => s.config.filter === "project_id=eq.proj-A")).toBe(true);

    rerender({ pid: "proj-B" });

    const filters = mockState.subscriptions.map((s) => s.config.filter);
    expect(filters).toContain("project_id=eq.proj-B");
  });

  it("cleanup remueve los canales al desmontar", () => {
    const { unmount } = renderHook(() => useRealtimeMetrics("proj-A"));
    expect(mockState.subscriptions.length).toBeGreaterThan(0);

    unmount();

    expect(mockState.removedChannels.sort()).toEqual(
      ["custom-assets-channel", "custom-findings-channel"].sort()
    );
  });

  it("usa la env key canónica (CS-301): PUBLISHABLE_KEY con fallback ANON_KEY", () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevPub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pub-key";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    renderHook(() => useRealtimeMetrics("proj-A"));

    expect(mockState.clientUrl).toBe("https://db.supabase.co");
    expect(mockState.clientKey).toBe("pub-key");

    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevPub;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
  });
});
