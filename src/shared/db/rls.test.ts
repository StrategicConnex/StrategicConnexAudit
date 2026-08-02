/* ═══════════════════════════════════════════════════════════════════════════
   RLS — Contract Test de aislamiento multi-tenant (T02-03)

   Verifica que `withRLS()`:
   1. Ejecuta `SELECT set_config('request.jwt.claims', <claims>, true)` con el
      claim `sub` = userId del usuario solicitante (diferente por tenant).
   2. Ejecuta `SET LOCAL ROLE authenticated` (nunca `SET ROLE` sin LOCAL).
   3. El callback recibe la transacción y su resultado se propaga.
   4. Un error 42501 (insufficient privilege) se loguea como
      RLS_VIOLATION_DETECTED y se re-lanza (fail-closed).
   5. La función queda cubierta por la suite CI (antes solo existían scripts
      manuales `test-rls.ts` fuera de vitest).

   Enfoque: contract test sobre el SQL emitido (sin DB real). Capturamos los
   statements que `db.transaction` recibe y los renderizamos con `toQuery`.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQL } from "drizzle-orm";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// db.transaction captura los statements y los expone para inspección
const executedStatements: unknown[] = [];

const mockDb = {
  transaction: vi.fn(async (callback: (tx: { execute: (stmt: unknown) => Promise<void> }) => Promise<unknown>) => {
    const tx = {
      execute: vi.fn(async (stmt: unknown) => {
        executedStatements.push(stmt);
      }),
    };
    return callback(tx);
  }),
};

const mockLogger = {
  security: vi.fn(async () => {}),
  error: vi.fn(async () => {}),
  info: vi.fn(async () => {}),
};

vi.mock("@/shared/db", () => ({
  db: mockDb,
  directDb: {},
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: mockLogger,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Renderiza un statement SQL de drizzle a texto + params (config pg). */
function render(stmt: unknown): { sql: string; params: unknown[] } {
  const config = {
    casing: { getColumnCasing: () => "" },
    escapeName: (name: string) => `"${name}"`,
    escapeParam: (index: number) => `$${index + 1}`,
    prepareTyping: undefined,
    inlineParams: false,
    paramStartIndex: { value: 0 },
  };
  const result = (stmt as SQL).toQuery(config as never);
  return { sql: result.sql, params: result.params };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("withRLS — aislamiento multi-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executedStatements.length = 0;
  });

  it("ejecuta set_config con claims del usuario y SET LOCAL ROLE authenticated", async () => {
    const { withRLS } = await import("./rls");

    await withRLS("user-a", async () => {});

    // 2 statements ejecutados dentro de la transacción
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(executedStatements).toHaveLength(2);

    const [setConfig, setRole] = [render(executedStatements[0]), render(executedStatements[1])];

    expect(setConfig.sql).toContain("set_config('request.jwt.claims'");
    expect(setConfig.sql).toContain("true");
    expect(setConfig.params).toHaveLength(1);

    const claims = JSON.parse(setConfig.params[0] as string);
    expect(claims.sub).toBe("user-a");
    expect(claims.role).toBe("authenticated");

    // SET LOCAL (transaccional) — nunca SET ROLE persistente
    expect(setRole.sql).toContain("SET LOCAL ROLE authenticated");
  });

  it("diferentes usuarios producen claims distintos (aislamiento por tenant)", async () => {
    const { withRLS } = await import("./rls");

    await withRLS("user-a", async () => {});
    await withRLS("user-b", async () => {});

    const claimsA = JSON.parse(render(executedStatements[0]).params[0] as string);
    const claimsB = JSON.parse(render(executedStatements[2]).params[0] as string);

    expect(claimsA.sub).toBe("user-a");
    expect(claimsB.sub).toBe("user-b");
    expect(claimsA).not.toEqual(claimsB);
  });

  it("propaga el resultado del callback y pasa la transacción", async () => {
    const { withRLS } = await import("./rls");

    const result = await withRLS("user-a", async (tx) => {
      expect(tx).toBeDefined();
      return { ok: true, count: 42 };
    });

    expect(result).toEqual({ ok: true, count: 42 });
  });

  it("errores 42501 se loguean como RLS_VIOLATION_DETECTED y se re-lanzan", async () => {
    const { withRLS } = await import("./rls");

    // Sobrescribimos transaction para que el primer execute lance 42501
    mockDb.transaction.mockImplementationOnce(async (callback) => {
      const tx = {
        execute: vi.fn(async () => {
          throw Object.assign(new Error("permission denied for table projects"), { code: "42501" });
        }),
      };
      return callback(tx);
    });

    await expect(withRLS("user-a", async () => {})).rejects.toThrow("permission denied");

    expect(mockLogger.security).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        action: "RLS_VIOLATION_DETECTED",
      }),
    );
    // No debe loguearse como error genérico de transacción
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("errores NO-42501 se loguean como DATABASE_TRANSACTION_FAILED y se re-lanzan", async () => {
    const { withRLS } = await import("./rls");

    mockDb.transaction.mockImplementationOnce(async (callback) => {
      const tx = {
        execute: vi.fn(async () => {
          throw new Error("connection terminated");
        }),
      };
      return callback(tx);
    });

    await expect(withRLS("user-a", async () => {})).rejects.toThrow("connection terminated");

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        action: "DATABASE_TRANSACTION_FAILED",
      }),
    );
    expect(mockLogger.security).not.toHaveBeenCalled();
  });
});
