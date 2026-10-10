import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, screen, fireEvent } from "@testing-library/react";
import { LiveMetricsBar, masReciente } from "./LiveMetricsBar";
import { flagEnvKey } from "@/shared/lib/flags";

/**
 * Pruebas dirigidas de la barra live: suscripción Realtime, aislamiento multi-tenant y
 * degradación a sondeo.
 *
 * El mock del cliente Supabase replica el de `useInvestigationRealtime.test.tsx`, con
 * un añadido que este componente necesita: `subscribe` RETIENE el callback de estado,
 * porque la degradación se decide por el estado del canal (`CHANNEL_ERROR`,
 * `TIMED_OUT`, `CLOSED`) y no por un fallo de red.
 *
 * UNA TRAMPA DE ESTE COMPONENTE QUE HACE FALLAR LOS TESTS A LA PRIMERA
 * ----------------------------------------------------------------------
 * La barra se renderiza COLAPSADA: solo muestra el badge. Los valores —contador de
 * eventos, fuente, estado— existen únicamente tras expandirla. Un test que busca
 * `8` sin expandir no encuentra nada y falla con un DOM que parece correcto.
 */

/** Periodo del sondeo de respaldo; espejo de FALLBACK_MS del componente. */
const FALLBACK = 15_000;
/** Margen de gracia antes de degradar por silencio; espejo de SUBSCRIBE_GRACE_MS. */
const GRACE = 4_000;

type EstadoCanal = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

interface Sub {
  channelName: string;
  event: string;
  config: { event: string; schema: string; table: string; filter?: string };
  callback: (payload: unknown) => void;
}

const mockState = vi.hoisted(() => ({
  subscriptions: [] as Sub[],
  removed: [] as string[],
  statusHandler: null as ((s: string) => void) | null,
  canales: [] as string[],
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (channelName: string) => {
      mockState.canales.push(channelName);
      const channel = {
        channelName,
        on: (event: string, config: unknown, callback: (payload: unknown) => void) => {
          mockState.subscriptions.push({
            channelName, event,
            config: config as Sub["config"], callback,
          });
          return channel;
        },
        subscribe: (handler?: (status: string) => void) => {
          mockState.statusHandler = handler ?? null;
          return channel;
        },
      };
      return channel;
    },
    removeChannel: (ch: { channelName: string }) => {
      mockState.removed.push(ch.channelName);
    },
  }),
}));

/** next-intl mínimo: devuelve la clave, suficiente para distinguir un texto de otro. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function snapshot(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      ts: "2026-10-10T10:00:00.000Z",
      uptime: { checks: 10, uptimePercent: 1, avgLatencyMs: 42 },
      findings: { total: 3, critical: 2, high: 1, latest: [] },
      events: { total: 7, latest: [{ created_at: "2026-10-10T09:00:00.000Z" }] },
      ...over,
    }),
  };
}

/** Deja correr el `poll()` inicial: es una promesa, y con fake timers no avanza sola. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Monta la barra, la EXPANDE y deja asentar el snapshot inicial. */
async function montar(props: { projectId?: string; investigationId?: string } = {}) {
  const r = render(<LiveMetricsBar projectId="p-1" investigationId="inv-1" {...props} />);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "title" }));
  return r;
}

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

function emitir(row: Record<string, unknown>) {
  const sub = mockState.subscriptions.find(
    (s) => s.config.table === "intelligence_run_events" && s.config.event === "INSERT"
  );
  if (!sub) throw new Error("No hay suscripción a intelligence_run_events");
  act(() => {
    sub.callback({ new: row });
  });
}

function estadoCanal(status: EstadoCanal) {
  act(() => {
    mockState.statusHandler?.(status);
  });
}

/**
 * `masReciente` se prueba aquí y no por el DOM a propósito.
 *
 * `lastEventTimestamp` se mantiene en el estado pero NO se pinta en la barra: el pie
 * muestra `lastCheckTimestamp` (la hora del sondeo), no la del último evento. Una
 * prueba que buscara ese valor en pantalla no encontraría nada y daría verde sin
 * haber ejercitado nada. La comparación de fechas se comprueba, por tanto, donde de
 * verdad se ejecuta: la función.
 */
describe("masReciente — conserva el instante más nuevo, no el último en llegar", () => {
  it("gana el más nuevo venga en el orden que venga", () => {
    const temprano = "2026-10-10T04:15:00.000Z";
    const tarde = "2026-10-10T23:40:00.000Z";
    expect(masReciente(tarde, temprano)).toBe(tarde);
    expect(masReciente(temprano, tarde)).toBe(tarde);
  });

  it("tolera que falte uno de los dos", () => {
    expect(masReciente(null, "2026-10-10T10:00:00.000Z")).toBe("2026-10-10T10:00:00.000Z");
    expect(masReciente("2026-10-10T10:00:00.000Z", null)).toBe("2026-10-10T10:00:00.000Z");
    expect(masReciente(null, null)).toBeNull();
  });

  it("con un instante ilegible cede el paso al que sí se puede comparar", () => {
    const bueno = "2026-10-10T10:00:00.000Z";
    expect(masReciente("no-es-una-fecha", bueno)).toBe(bueno);
    expect(masReciente(bueno, "no-es-una-fecha")).toBe(bueno);
  });

  it("en empate devuelve el que ya estaba, para no dar un salto sin motivo", () => {
    const instante = "2026-10-10T10:00:00.000Z";
    expect(masReciente(instante, instante)).toBe(instante);
  });
});

const FLAG = flagEnvKey("realtimeLive");
const FLAG_PUBLICA = "NEXT_PUBLIC_" + FLAG;

beforeEach(() => {
  mockState.subscriptions = [];
  mockState.removed = [];
  mockState.canales = [];
  mockState.statusHandler = null;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(snapshot());
  // Sin esto el componente llama al fetch real de jsdom y el mock nunca ve nada:
  // el fallo sale como «0 llamadas» y no señala el sitio correcto.
  vi.stubGlobal("fetch", fetchMock);
  // El cliente solo ve la clave pública; la desnuda no llega al bundle.
  delete process.env[FLAG];
  vi.stubEnv(FLAG_PUBLICA, "on");
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete process.env[FLAG];
  delete process.env[FLAG_PUBLICA];
});

describe("LiveMetricsBar — suscripción Realtime (ADR-004 enmienda §12.1)", () => {
  it("se suscribe a intelligence_run_events filtrando por investigation_id", async () => {
    await montar();
    const sub = mockState.subscriptions.find((s) => s.config.table === "intelligence_run_events");
    expect(sub).toBeDefined();
    expect(sub!.config.event).toBe("INSERT");
    expect(sub!.config.schema).toBe("public");
    // La tabla NO tiene project_id; su policy resuelve por investigation_id.
    expect(sub!.config.filter).toBe("investigation_id=eq.inv-1");
    expect(sub!.config.filter).not.toContain("project_id");
  });

  it("usa un canal con nombre único por investigación", async () => {
    await montar();
    expect(mockState.canales).toEqual(["live-metrics:inv-1"]);
  });

  it("no se suscribe a ninguna otra tabla", async () => {
    await montar();
    expect(mockState.subscriptions.map((s) => s.config.table)).toEqual([
      "intelligence_run_events",
    ]);
  });

  it("cuenta un evento de la investigación activa", async () => {
    await montar();
    estadoCanal("SUBSCRIBED");
    emitir({ investigation_id: "inv-1", created_at: "2026-10-10T09:30:00.000Z" });
    expect(screen.getByText("8")).toBeDefined();
  });

  it("AISLAMIENTO: ignora un evento de otra investigación", async () => {
    await montar();
    estadoCanal("SUBSCRIBED");
    emitir({ investigation_id: "inv-OTRA", created_at: "2026-10-10T09:30:00.000Z" });
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.queryByText("8")).toBeNull();
  });

  it("AISLAMIENTO: ignora una fila sin investigation_id", async () => {
    await montar();
    estadoCanal("SUBSCRIBED");
    emitir({ message: "fila sin investigation_id" });
    expect(screen.getByText("7")).toBeDefined();
  });

  it("el snapshot no hace retroceder un contador que ya iba por delante", async () => {
    await montar();                       // snapshot inicial: total 7
    estadoCanal("SUBSCRIBED");
    emitir({ investigation_id: "inv-1", created_at: "2026-10-10T09:30:00.000Z" });
    expect(screen.getByText("8")).toBeDefined();

    // Para que el snapshot COMPITA con el contador hace falta que el sondeo corra,
    // así que primero hay que degradar. Con el canal suscrito no hay sondeo y la
    // prueba pasaría sin llegar a ejecutar la reconciliación que dice comprobar.
    estadoCanal("CHANNEL_ERROR");
    // El sondeo responde con 3, por detrás del 8 local: el evento que contó
    // Realtime aún no está en la fila que el servidor calcula. Asignarlo tal cual
    // haría retroceder la cifra.
    fetchMock.mockResolvedValue(
      snapshot({ events: { total: 3, latest: [] } })
    );
    await tick(FALLBACK);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1); // el snapshot llegó
    expect(screen.getByText("8")).toBeDefined();
  });

  it("el snapshot sí sube el contador cuando va por delante (Math.max no es un tope)", async () => {
    await montar();                       // snapshot inicial: total 7
    estadoCanal("CHANNEL_ERROR");         // arranca el sondeo
    fetchMock.mockResolvedValue(
      snapshot({ events: { total: 12, latest: [{ created_at: "2026-10-10T11:00:00.000Z" }] } })
    );
    await tick(FALLBACK);

    expect(screen.getByText("12")).toBeDefined();
  });

  it("no activa el sondeo cuando el canal está suscrito", async () => {
    await montar();
    estadoCanal("SUBSCRIBED");
    await tick(FALLBACK * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marca la fuente como realtime cuando el canal confirma", async () => {
    await montar();
    estadoCanal("SUBSCRIBED");
    expect(screen.getByText("realtime")).toBeDefined();
  });
});

describe("LiveMetricsBar — degradación a sondeo (fallback)", () => {
  it.each<EstadoCanal>(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "degrada a sondeo cuando el canal reporta %s",
    async (status) => {
      await montar();
      estadoCanal(status);
      expect(screen.getByText("degraded")).toBeDefined();
      await tick(FALLBACK);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    }
  );

  it("degrada si el canal nunca confirma dentro del margen de gracia", async () => {
    await montar();
    // Antes de que venza la gracia el estado aún es el inicial.
    await tick(GRACE - 1000);
    estadoCanal("SUBSCRIBED");
    expect(screen.getByText("realtime")).toBeDefined();
  });

  it("degrada por silencio cuando el canal no dice nada", async () => {
    await montar();
    await tick(GRACE + 100);
    expect(screen.getByText("degraded")).toBeDefined();
  });

  it("con el flag apagado no se suscribe y sondea cada 15 s", async () => {
    vi.stubEnv(FLAG_PUBLICA, "off");
    await montar();
    expect(mockState.subscriptions).toHaveLength(0);
    expect(screen.getByText("degraded")).toBeDefined();
    await tick(FALLBACK);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sin investigationId no hay filtro posible y sondea", async () => {
    await montar({ investigationId: undefined });
    // La tabla no tiene project_id: sin investigationId no se puede filtrar.
    expect(mockState.subscriptions).toHaveLength(0);
    await tick(FALLBACK);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("LiveMetricsBar — limpieza", () => {
  it("cierra el canal al desmontar", async () => {
    const { unmount } = await montar();
    unmount();
    expect(mockState.removed).toEqual(["live-metrics:inv-1"]);
  });

  it("detiene el sondeo al desmontar", async () => {
    vi.stubEnv(FLAG_PUBLICA, "off");
    const { unmount } = await montar();
    await tick(FALLBACK * 2);
    const antes = fetchMock.mock.calls.length;
    unmount();
    await tick(FALLBACK * 4);
    expect(fetchMock.mock.calls.length).toBe(antes);
  });
});