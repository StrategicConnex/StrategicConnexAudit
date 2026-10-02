/**
 * instrumentation — fail-fast de env + sink de errores `app_logs` (ADR-007).
 *
 * Verifica que register() valida en runtime nodejs, se salta en edge y en
 * fase de build, y aborta el arranque si falta una variable requerida.
 * Además: instala el sink de errores sólo en producción y que el hook
 * onRequestError persiste los 500 no capturados con las mismas guardas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { register, onRequestError } from "./instrumentation";

vi.mock("./server/observability/app-logs-sink", () => ({
  installErrorSink: vi.fn(),
  captureRequestError: vi.fn().mockResolvedValue(undefined),
}));

const REQUIRED_VALID = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/db",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
  OPENROUTER_API_KEY: "sk-or-test",
};

function stubValidEnv(): void {
  for (const [key, value] of Object.entries(REQUIRED_VALID)) {
    vi.stubEnv(key, value);
  }
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
}

describe("instrumentation register — validación de env", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    stubValidEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("arranca con las variables requeridas válidas", async () => {
    await expect(register()).resolves.toBeUndefined();
  });

  it("arranca con el alias ANON legacy cuando falta la PUBLISHABLE", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    await expect(register()).resolves.toBeUndefined();
  });

  it("aborta el arranque si faltan las dos claves Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(register()).rejects.toThrow();
  });

  it("aborta el arranque si falta una variable requerida", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(register()).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("aborta el arranque si una variable tiene formato inválido", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(register()).rejects.toThrow();
  });

  it("se salta en el runtime edge (el proxy no valida aquí)", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("DATABASE_URL", "");
    await expect(register()).resolves.toBeUndefined();
  });

  it("se salta durante la fase de build (CI/Vercel sin secrets)", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("DATABASE_URL", "");
    await expect(register()).resolves.toBeUndefined();
  });

  it("en producción instala el sink de errores app_logs (ADR-007)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await register();
    const { installErrorSink } = await import("./server/observability/app-logs-sink");
    expect(installErrorSink).toHaveBeenCalledTimes(1);
  });

  it("fuera de producción NO instala el sink (dev/test no escriben en la BD)", async () => {
    await register();
    const { installErrorSink } = await import("./server/observability/app-logs-sink");
    expect(installErrorSink).not.toHaveBeenCalled();
  });
});

describe("instrumentation onRequestError — captura de 500 no capturados", () => {
  const REQUEST = { path: "/api/demo?x=1", method: "GET", headers: {} } as const;
  const CONTEXT = {
    routerKind: "App Router",
    routePath: "/api/demo",
    routeType: "route",
    revalidateReason: undefined,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("en producción persiste el error en app_logs", async () => {
    const error = new Error("boom");
    await onRequestError(error, REQUEST, CONTEXT);
    const { captureRequestError } = await import("./server/observability/app-logs-sink");
    expect(captureRequestError).toHaveBeenCalledWith(error, REQUEST, CONTEXT);
  });

  it("en runtime edge NO persiste", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("boom"), REQUEST, CONTEXT);
    const { captureRequestError } = await import("./server/observability/app-logs-sink");
    expect(captureRequestError).not.toHaveBeenCalled();
  });

  it("en fase de build NO persiste", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await onRequestError(new Error("boom"), REQUEST, CONTEXT);
    const { captureRequestError } = await import("./server/observability/app-logs-sink");
    expect(captureRequestError).not.toHaveBeenCalled();
  });

  it("fuera de producción NO persiste", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await onRequestError(new Error("boom"), REQUEST, CONTEXT);
    const { captureRequestError } = await import("./server/observability/app-logs-sink");
    expect(captureRequestError).not.toHaveBeenCalled();
  });

  it("un fallo del sink jamás propaga (fail-open)", async () => {
    const { captureRequestError } = await import("./server/observability/app-logs-sink");
    vi.mocked(captureRequestError).mockRejectedValueOnce(new Error("sink down"));
    await expect(onRequestError(new Error("boom"), REQUEST, CONTEXT)).resolves.toBeUndefined();
  });
});
