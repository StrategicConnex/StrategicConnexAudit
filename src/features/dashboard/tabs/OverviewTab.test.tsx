import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup, screen, act } from "@testing-library/react";
import { flagEnvKey } from "@/shared/lib/flags";

// Identidad estable dentro del factory (vi.mock se eleva; no referenciar fuera).
vi.mock("next-intl", () => {
  const t = (key: string) => key;
  return { useTranslations: () => t };
});

// next/dynamic en jsdom: el chunk diferido nunca debe cargarse en el test.
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const DynamicStub = () => null;
    return DynamicStub;
  },
}));

/**
 * Mock del cliente Supabase para la Fase 2 (C1): replica el de
 * `LiveMetricsBar.test.tsx`. `subscribe` RETIENE el callback de estado porque la
 * degradación se decide por el estado del canal (CHANNEL_ERROR/TIMED_OUT/CLOSED)
 * y no por un fallo de red.
 */
interface SubRealtime {
  event: string;
  config: { event: string; schema: string; table: string; filter?: string };
  callback: (payload: unknown) => void;
}

const rt = vi.hoisted(() => ({
  subscriptions: [] as SubRealtime[],
  canales: [] as string[],
  removed: [] as string[],
  statusHandler: null as ((s: string) => void) | null,
}));

vi.mock("@/shared/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (name: string) => {
      rt.canales.push(name);
      const ch = {
        name,
        on: (event: string, config: unknown, callback: (payload: unknown) => void) => {
          rt.subscriptions.push({ event, config: config as SubRealtime["config"], callback });
          return ch;
        },
        subscribe: (handler?: (status: string) => void) => {
          rt.statusHandler = handler ?? null;
          return ch;
        },
      };
      return ch;
    },
    removeChannel: (ch: { name: string }) => {
      rt.removed.push(ch.name);
    },
  }),
}));

import { OverviewTab } from "./OverviewTab";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  });
}

describe("OverviewTab — fuente de salud del motor IA", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/api/intelligence/live")) {
        return jsonResponse({
          success: true,
          uptime: { checks: [], uptimePercent: null, avgLatencyMs: null },
        });
      }
      return jsonResponse({
        modelsHealthy: 3,
        modelsTotal: 5,
        overallStatus: "degraded",
        checkedAt: "2026-10-04T15:51:23.000Z",
      });
    });
  });

  it("lee la salud IA vía /api/ai/status y nunca llama a la ruta cron /api/ai/healthcheck", async () => {
    render(<OverviewTab dashboardData={[]} setActiveTab={vi.fn()} />);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/api/ai/status"))).toBe(true);
    });

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    // /api/ai/healthcheck exige Bearer CRON_SECRET: un fetch desde el navegador
    // siempre recibe 401 y el estado del motor jamás podría poblarse.
    expect(urls.some((u) => u.includes("/api/ai/healthcheck"))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C1 Fase 2 — Realtime del hero (cierra ADR-004-AMEND)
//
// Dos trampas de este componente que hay que tener presentes al leer los tests:
//   1. El hero solo pinta la telemetría con `hero.checks.length > 0`, así que el
//      mock de `/api/intelligence/live` devuelve chequeos reales: sin ellos el
//      estado queda "empty" y la insignia de fuente no existe (el test fallaría
//      buscando algo que el DOM no tiene por qué tener).
//   2. La carga del snapshot es una promesa; con fake timers no avanza sola, hay
//      que cederle el microtask (helper `montar`).
// ═════════════════════════════════════════════════════════════════════════════

const FLAG = flagEnvKey("realtimeLive");
const FLAG_PUBLICA = "NEXT_PUBLIC_" + FLAG;

/** Espejos de los plazos del componente (no se importan: son detalles internos). */
const COALESCE = 1_000;
const GRACE = 4_000;
const FALLBACK = 15_000;

type EstadoCanal = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

function chequeo() {
  return { isUp: true, responseTimeMs: 42, checkedAt: "2026-10-10T10:00:00.000Z" };
}

/** Cuántas veces se pidió el snapshot del hero (el otro fetch es /api/ai/status). */
function snapshots() {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/intelligence/live")).length;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function montar(projectId = "p-1") {
  const r = render(<OverviewTab dashboardData={[]} setActiveTab={vi.fn()} projectId={projectId} />);
  await flush();
  return r;
}

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

function estadoCanal(status: EstadoCanal) {
  act(() => {
    rt.statusHandler?.(status);
  });
}

function emitirEvento() {
  const sub = rt.subscriptions.find((s) => s.config.table === "intelligence_run_events");
  if (!sub) throw new Error("No hay suscripción a intelligence_run_events");
  act(() => {
    sub.callback({ new: { id: "evento-1" } });
  });
}

describe("OverviewTab — Realtime del hero (ADR-004 enmienda, Fase 2)", () => {
  beforeEach(() => {
    rt.subscriptions = [];
    rt.canales = [];
    rt.removed = [];
    rt.statusHandler = null;
    fetchMock.mockReset();
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/api/intelligence/live")) {
        return jsonResponse({
          success: true,
          uptime: { checks: [chequeo(), chequeo(), chequeo()], uptimePercent: 1, avgLatencyMs: 42 },
        });
      }
      return jsonResponse({ modelsHealthy: 3, modelsTotal: 5, overallStatus: "ok" });
    });
    delete process.env[FLAG];
    vi.stubEnv(FLAG_PUBLICA, "on");
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete process.env[FLAG];
    delete process.env[FLAG_PUBLICA];
  });

  it("se suscribe a intelligence_run_events (INSERT) en un canal propio del hero", async () => {
    await montar();
    expect(rt.canales).toEqual(["overview-hero:p-1"]);
    expect(rt.subscriptions).toHaveLength(1);
    expect(rt.subscriptions[0]!.config).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "intelligence_run_events",
    });
  });

  it("no filtra por project_id: la tabla no tiene esa columna", async () => {
    await montar();
    // Filtrar por una columna inexistente no filtraría nada y daría una falsa
    // sensación de aislamiento; el aislamiento lo impone la policy de 0022.
    expect(rt.subscriptions[0]!.config.filter).toBeUndefined();
  });

  it("con el flag apagado no se suscribe y refresca cada 15 s", async () => {
    vi.stubEnv(FLAG_PUBLICA, "off");
    await montar();
    expect(rt.subscriptions).toHaveLength(0);
    const antes = snapshots();
    await tick(FALLBACK);
    expect(snapshots()).toBe(antes + 1);
  });

  it("un evento nuevo dispara un refresco del snapshot", async () => {
    await montar();
    estadoCanal("SUBSCRIBED");
    const antes = snapshots();
    emitirEvento();
    await tick(COALESCE);
    expect(snapshots()).toBe(antes + 1);
  });

  it("agrupa la ráfaga: tres eventos separados son un solo refresco", async () => {
    await montar();
    estadoCanal("SUBSCRIBED");
    const antes = snapshots();
    // Separados en ticks distintos a propósito: si se emitieran los tres en el
    // mismo tick, React agruparía los tres `setState` y el test pasaría aunque no
    // existiera la ventana de agrupación (falsa evidencia).
    emitirEvento();
    await tick(200);
    emitirEvento();
    await tick(200);
    emitirEvento();
    await tick(600); // vence la ventana de 1 s abierta por el primer evento
    expect(snapshots()).toBe(antes + 1);
  });

  it("en la ruta feliz no hay refresco por tiempo", async () => {
    await montar();
    estadoCanal("SUBSCRIBED");
    const antes = snapshots();
    await tick(FALLBACK * 3);
    expect(snapshots()).toBe(antes);
  });

  it("muestra la fuente realtime cuando el canal confirma", async () => {
    await montar();
    estadoCanal("SUBSCRIBED");
    expect(screen.getByText("realtime")).toBeDefined();
  });

  it.each<EstadoCanal>(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "degrada a sondeo cuando el canal reporta %s",
    async (status) => {
      await montar();
      estadoCanal(status);
      expect(screen.getByText("degraded")).toBeDefined();
      const antes = snapshots();
      await tick(FALLBACK);
      expect(snapshots()).toBe(antes + 1);
    }
  );

  it("degrada por silencio si el canal no confirma dentro del margen", async () => {
    await montar();
    await tick(GRACE + 100);
    expect(screen.getByText("degraded")).toBeDefined();
    const antes = snapshots();
    await tick(FALLBACK);
    expect(snapshots()).toBe(antes + 1);
  });
});

describe("OverviewTab — Realtime: limpieza de la suscripción", () => {
  beforeEach(() => {
    rt.subscriptions = [];
    rt.canales = [];
    rt.removed = [];
    rt.statusHandler = null;
    fetchMock.mockReset();
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/api/intelligence/live")) {
        return jsonResponse({
          success: true,
          uptime: { checks: [chequeo()], uptimePercent: 1, avgLatencyMs: 42 },
        });
      }
      return jsonResponse({ modelsHealthy: 3, modelsTotal: 5, overallStatus: "ok" });
    });
    delete process.env[FLAG];
    vi.stubEnv(FLAG_PUBLICA, "on");
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete process.env[FLAG];
    delete process.env[FLAG_PUBLICA];
  });

  it("cierra el canal y detiene el refresco al desmontar", async () => {
    const { unmount } = await montar();
    estadoCanal("SUBSCRIBED");
    unmount();
    expect(rt.removed).toEqual(["overview-hero:p-1"]);
    const antes = snapshots();
    await tick(FALLBACK * 2);
    expect(snapshots()).toBe(antes);
  });

  it("libera el canal anterior y abre uno nuevo al cambiar de proyecto", async () => {
    const { rerender } = await montar();
    estadoCanal("SUBSCRIBED");
    rerender(<OverviewTab dashboardData={[]} setActiveTab={vi.fn()} projectId="p-2" />);
    await flush();
    expect(rt.canales).toEqual(["overview-hero:p-1", "overview-hero:p-2"]);
    expect(rt.removed).toEqual(["overview-hero:p-1"]);
  });

  it("no deja un sondeo vivo tras desmontar en modo degradado", async () => {
    const { unmount } = await montar();
    estadoCanal("CHANNEL_ERROR");
    await tick(FALLBACK);
    // Mientras vive el sondeo hay un temporizador más que sin él. No basta con
    // comprobar que no hay fetch: `refrescar` ya se corta con `cancelled`, así que
    // sin contar temporizadores un `clearInterval` ausente pasaría inadvertido.
    const temporizadoresConSondeo = vi.getTimerCount();
    const antes = snapshots();
    unmount();
    await flush();
    expect(vi.getTimerCount()).toBeLessThan(temporizadoresConSondeo);
    await tick(FALLBACK * 3);
    expect(snapshots()).toBe(antes);
  });
});
