/**
 * @vitest-environment node
 *
 * Se ejecuta en entorno `node` (no el `jsdom` por defecto del proyecto)
 * porque el AsyncLocalStorage que propaga el contexto de petición solo se
 * construye cuando `typeof window === "undefined"` — igual que en producción.
 * Misma convención que `src/lib/request-context.test.ts`.
 *
 * Regresión del logger de auditoría (Bache #1 del audit de producción).
 *
 * ANTES: este módulo llamaba a `headers()` de `next/headers` por su cuenta.
 * Esa llamada LANZA fuera del scope de petición —jobs de Trigger.dev, cron,
 * tests, server actions desacopladas— y el `catch` se tragaba la excepción.
 * Consecuencia: el INSERT en `audit_logs` NO se ejecutaba nunca y cada evento
 * `security`/`error` se perdía en silencio, dejando solo una línea de consola.
 *
 * AHORA: la IP y el user-agent viajan por AsyncLocalStorage
 * (`withRequestContext` → `getRequestContext`), así que el insert se ejecuta
 * tanto dentro como fuera del scope.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertValues = vi.fn(async () => undefined);

vi.mock("@/shared/db", () => ({
  directDb: {
    insert: vi.fn(() => ({ values: insertValues })),
  },
}));

vi.mock("@/lib/logger", async () => {
  const actual = await vi.importActual<typeof import("@/lib/logger")>(
    "@/lib/logger"
  );
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
});

import { logger as auditLogger } from "@/shared/lib/logger";
import { getRequestContext, runWithRequestContext } from "@/lib/logger";

describe("logger de auditoría — persistencia en audit_logs", () => {
  beforeEach(() => {
    insertValues.mockClear();
    vi.clearAllMocks();
  });

  it("persiste el evento security SIN scope de petición (el bug que se existía)", async () => {
    await auditLogger.security({
      action: "UNAUTHORIZED_ACTION_ATTEMPT",
      metadata: { motivo: "sin sesión" },
    });

    // Este es el aserto que fallaba antes: sin `headers()` no debe haber
    // excepción y el insert debe haberse ejecutado.
    expect(insertValues).toHaveBeenCalledTimes(1);

    const row = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.action).toBe("SECURITY: UNAUTHORIZED_ACTION_ATTEMPT");
    // Sin contexto y sin override explícito, degrada a "unknown" en vez de fallar.
    expect(row.ipAddress).toBe("unknown");
    expect(row.userAgent).toBe("unknown");
  });

  it("persiste el evento error sin lanzar fuera de scope", async () => {
    await auditLogger.error({
      action: "SERVER_ACTION_EXCEPTION",
      error: new Error("boom"),
    });

    expect(insertValues).toHaveBeenCalledTimes(1);
    const row = insertValues.mock.calls[0]![0] as {
      action: string;
      newData: { error?: string; stack?: string };
    };
    expect(row.action).toBe("ERROR: SERVER_ACTION_EXCEPTION");
    expect(row.newData.error).toBe("boom");
  });

  it("hereda IP y user-agent del contexto de petición (AsyncLocalStorage)", async () => {
    await runWithRequestContext(
      { ipAddress: "203.0.113.9", userAgent: "vitest-agent/1.0" },
      async () => {
        await auditLogger.security({ action: "LOGIN_FAILED" });
      }
    );

    expect(insertValues).toHaveBeenCalledTimes(1);
    const row = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.ipAddress).toBe("203.0.113.9");
    expect(row.userAgent).toBe("vitest-agent/1.0");
  });

  it("permite override explícito sobre el contexto", async () => {
    await runWithRequestContext(
      { ipAddress: "203.0.113.9" },
      async () => {
        await auditLogger.security({
          action: "RATE_LIMIT_BREACH",
          ipAddress: "198.51.100.4",
        });
      }
    );

    const row = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.ipAddress).toBe("198.51.100.4");
  });

  it("NO persiste en BD los niveles info y warn (solo security/error)", async () => {
    await auditLogger.info({ action: "ACTION_SUCCESS" });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("omite el campo error en vez de guardar el string 'undefined'", async () => {
    await auditLogger.security({ action: "SITUACION_SIN_ERROR" });

    const row = insertValues.mock.calls[0]![0] as {
      newData: Record<string, unknown>;
    };
    expect("error" in row.newData).toBe(false);
  });

  it("un fallo de BD no rompe la llamada, pero se reporta con contexto", async () => {
    insertValues.mockRejectedValueOnce(new Error("db caída"));
    const { logger: consoleLogger } = await import("@/lib/logger");

    await expect(
      auditLogger.security({ action: "TOLERANCIA_A_FALLO" })
    ).resolves.toBeUndefined();

    expect(consoleLogger.error).toHaveBeenCalledWith(
      "🚨 FALLO CRITICO AL GUARDAR AUDIT LOG:",
      expect.objectContaining({ action: "TOLERANCIA_A_FALLO", level: "security" })
    );
  });

  it("getRequestContext() es undefined fuera de scope (no lanza)", () => {
    expect(getRequestContext()).toBeUndefined();
  });
});