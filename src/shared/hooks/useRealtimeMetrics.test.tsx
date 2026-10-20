import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useRealtimeMetrics } from "../hooks/useRealtimeMetrics";

// ─── Mock del cliente Supabase ──────────────────────────────────────────────
// Captura las suscripciones postgres_changes (config con filtros) y expone los
// callbacks para simular eventos del servidor (incl. cross-tenant).
//
// H-10 (2026-10-20): el hook ahora crea el cliente vía `await import` — el
// registro de canales es ASÍNCRONO. Todos los tests esperan el registro con
// `vi.waitFor` antes de disparar eventos o hacer aserciones; `renderHook`
// puro ya no basta porque las suscripciones aún no existen en el tick 1.
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

/** Espera a que el setup asíncrono (import dinámico → createClient) termine. */
async function until(cond: () => boolean, description: string) {
  await vi.waitFor(() => {
    if (!cond()) throw new Error(description);
  });
}

async function fireInsert(table: string, row: Record<string, unknown>) {
  await until(
    () =>
      mockState.subscriptions.some(
        (s) => s.config.table === table && s.config.event === "INSERT"
      ),
    `No subscription (async setup) for INSERT on ${table}`
  );
  const sub = mockState.subscriptions.find(
    (s) => s.config.table === table && s.config.event === "INSERT"
  )!;
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

  it("suscripciones con filtro tenant-scoped (project_id=eq.<proyecto>)", async () => {
    renderHook(() => useRealtimeMetrics("proj-A"));
    await until(() => mockState.subscriptions.length === 2, "2 canales esperados");

    const tables = mockState.subscriptions.map((s) => s.config.table).sort();
    expect(tables).toEqual(["intelligence_assets", "intelligence_findings"]);

    for (const sub of mockState.subscriptions) {
      expect(sub.config.schema).toBe("public");
      expect(sub.config.event).toBe("INSERT");
      expect(sub.config.filter).toBe("project_id=eq.proj-A");
    }
  });

  it("sin projectId no suscribe (no hay filtro que exponer)", async () => {
    renderHook(() => useRealtimeMetrics(undefined));
    // Flush de microtasks del efecto: si este montaje creara suscripciones
    // (no debe), ya habrían aparecido tras resolver el import dinámico.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockState.subscriptions).toHaveLength(0);
  });

  it("evento INSERT del propio tenant actualiza latestFinding", async () => {
    const { result } = renderHook(() => useRealtimeMetrics("proj-A"));

    await fireInsert("intelligence_findings", {
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

  it("evento INSERT de OTRO tenant (proj-B) NO actualiza latestFinding", async () => {
    const { result } = renderHook(() => useRealtimeMetrics("proj-A"));

    await fireInsert("intelligence_findings", {
      project_id: "proj-B",
      severity: "critical",
      title: "Datos de otro cliente",
      created_at: "2026-08-08T10:00:00Z",
    });

    expect(result.current.latestFinding).toBeNull();
  });

  it("evento INSERT del propio tenant incrementa assetsDiscovered", async () => {
    const { result } = renderHook(() => useRealtimeMetrics("proj-A"));

    await fireInsert("intelligence_assets", { project_id: "proj-A", asset_type: "subdomain" });
    await fireInsert("intelligence_assets", { project_id: "proj-A", asset_type: "ip" });

    expect(result.current.assetsDiscovered).toBe(2);
  });

  it("evento INSERT de OTRO tenant NO incrementa assetsDiscovered", async () => {
    const { result } = renderHook(() => useRealtimeMetrics("proj-A"));

    await fireInsert("intelligence_assets", { project_id: "proj-B", asset_type: "subdomain" });
    await fireInsert("intelligence_assets", { project_id: "proj-B", asset_type: "ip" });

    expect(result.current.assetsDiscovered).toBe(0);
  });

  it("cambio de projectId re-suscribe con el nuevo filtro", async () => {
    const { rerender } = renderHook(({ pid }) => useRealtimeMetrics(pid), {
      initialProps: { pid: "proj-A" },
    });
    await until(() => mockState.subscriptions.length === 2, "canales de proj-A");

    expect(mockState.subscriptions.every((s) => s.config.filter === "project_id=eq.proj-A")).toBe(true);

    rerender({ pid: "proj-B" });

    await until(
      () => mockState.subscriptions.some((s) => s.config.filter === "project_id=eq.proj-B"),
      "canales re-suscritos con proj-B"
    );
    const filters = mockState.subscriptions.map((s) => s.config.filter);
    expect(filters).toContain("project_id=eq.proj-B");
  });

  it("cleanup remueve los canales al desmontar", async () => {
    const { unmount } = renderHook(() => useRealtimeMetrics("proj-A"));
    await until(() => mockState.subscriptions.length === 2, "canales esperados");

    unmount();

    // El closure de limpieza se instala al final del setup asíncrono; esperar
    // a que las removiones efectivamente ocurran tras el unmount.
    await until(() => mockState.removedChannels.length === 2, "cleanup async remueve 2");
    expect(mockState.removedChannels.sort()).toEqual(
      ["metrics-assets-proj-A", "metrics-findings-proj-A"].sort()
    );
  });

  it("los canales se nombran por proyecto para evitar colisiones multi-tenant", async () => {
    renderHook(() => useRealtimeMetrics("proj-A"));
    await until(() => mockState.subscriptions.length === 2, "canales esperados");

    const names = mockState.subscriptions.map((s) => s.channelName);
    expect(names).toContain("metrics-findings-proj-A");
    expect(names).toContain("metrics-assets-proj-A");
  });

  it("usa la env key canónica (CS-301): PUBLISHABLE_KEY con fallback ANON_KEY", async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevPub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pub-key";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    try {
      renderHook(() => useRealtimeMetrics("proj-A"));
      await until(() => mockState.clientUrl !== "", "cliente creado de forma asíncrona");

      expect(mockState.clientUrl).toBe("https://db.supabase.co");
      expect(mockState.clientKey).toBe("pub-key");
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevPub;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    }
  });
});
