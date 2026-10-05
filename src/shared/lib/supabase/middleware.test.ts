import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regresión del bucle de telemetría de accesos.
 *
 * `/api/internal/track-access` atraviesa el mismo proxy que las páginas. Como el
 * proxy ve la sesión del usuario y todavía no existe la cookie `sl_track`, se
 * disparaba a sí mismo: cada respuesta generaba la siguiente request. Medido en
 * vivo: ~6,5 peticiones/s por navegador autenticado, sin interacción del usuario,
 * cada una con su upsert a `user_logs` y saturando el pooler de Postgres.
 *
 * Estos tests fijan que la telemetría nunca se auto-dispara y que el throttling por
 * `sl_track` sigue funcionando.
 */

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("@/shared/config/env", () => ({
  env: { supabaseUrl: "https://test.supabase.co", supabaseAnonKey: "anon" },
}));

import { updateSession } from "./middleware";

/** NextRequest mínimo con las cookies que el test necesite. */
function makeRequest(path: string, cookies: Record<string, string> = {}) {
  const jar = new Map(Object.entries(cookies));
  const url = new URL(`http://localhost:3000${path}`);
  return {
    nextUrl: { pathname: path, clone: () => ({ ...url, pathname: url.pathname }) },
    url: url.toString(),
    cookies: {
      get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      set: (n: string, v: string) => jar.set(n, v),
    },
    headers: new Headers({ "user-agent": "vitest", "x-forwarded-for": "1.2.3.4" }),
  };
}

describe("telemetría de accesos — no se auto-dispara", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEV_BYPASS_AUTH", "false");
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({
      data: { user: { id: "u-1", email: "user@example.test" } },
    });
    fetchSpy = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  const trackCalls = () =>
    fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/api/internal/track-access"));

  it("NO dispara telemetría cuando el request ES la ruta interna", async () => {
    await updateSession(makeRequest("/api/internal/track-access") as never);
    expect(trackCalls()).toHaveLength(0);
  });

  it("NO dispara telemetría desde ninguna ruta /api/internal/*", async () => {
    await updateSession(makeRequest("/api/internal/otra-cosa") as never);
    expect(trackCalls()).toHaveLength(0);
  });

  it("SÍ dispara telemetría una vez en una página normal sin cookie previa", async () => {
    await updateSession(makeRequest("/") as never);
    expect(trackCalls()).toHaveLength(1);
  });

  it("respeta el throttle: con sl_track reciente no vuelve a disparar", async () => {
    const ahora = String(Date.now());
    await updateSession(makeRequest("/", { sl_track: ahora }) as never);
    expect(trackCalls()).toHaveLength(0);
  });

  it("sin usuario no hay telemetría", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await updateSession(makeRequest("/") as never);
    expect(trackCalls()).toHaveLength(0);
  });

  it("el bucle clásico está cerrado: la ruta interna no genera la siguiente llamada", async () => {
    // El fetch interno reentrante apuntaría a la misma ruta; con la exclusión,
    // esa ruta nunca vuelve a pedir telemetría, así que la cadena termina en 1.
    await updateSession(makeRequest("/api/internal/track-access") as never);
    expect(trackCalls()).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
