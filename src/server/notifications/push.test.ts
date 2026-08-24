/* ═══════════════════════════════════════════════════════════════════════════
   Push Notifications — boolean `active` semantics (TSK-009 / MAT-207)

   Verifica que tras el cambio de tipo de push_subscriptions.active (text → 
   boolean, migración 0021):
   - La query de suscripciones activas usa `eq(active, true)` (boolean REAL,
     no el string 'true' legacy).
   - La limpieza de endpoints expirados usa `set({ active: false })` (boolean).
   - sendPushNotificationToUser combina userId + active=true dentro de and().

   Sin VAPID keys configuradas, sendPushNotification retorna false sin tocar
   la red (camino de limpieza), lo que permite probar la semántica boolean
   de forma aislada.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared mutable mock state ──────────────────────────────────────────────
let mockDbResult: Array<Record<string, unknown>> = [];
const captureWhere = vi.fn();   // argumentos de cada .where(...)
const captureSet = vi.fn();     // argumentos de cada .set(...)

// ─── Mock Drizzle (patrón del siem-exporter.test.ts) ─────────────────────────
vi.mock("@/shared/db", () => {
  const builder = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (r: (v: Record<string, unknown>[]) => unknown) => r(mockDbResult);
        if (prop === "catch") return () => undefined;
        if (prop === "where") {
          return (...args: unknown[]) => {
            captureWhere(...args);
            return builder;
          };
        }
        if (prop === "set") {
          return (...args: unknown[]) => {
            captureSet(...args);
            return { where: captureWhere };
          };
        }
        return () => builder;
      },
    }
  );

  return {
    directDb: {
      select: vi.fn(() => builder),
      update: vi.fn(() => builder),
    },
  };
});

import { sendPushNotificationToAll, sendPushNotificationToUser } from "./push";

// ─── Helper: extraer SQL + params de un objeto SQL de Drizzle ─────────────────
// Drizzle expone la estructura interna vía queryChunks:
//   - chunks con `value: string[]`  → fragmentos de SQL literal
//   - chunks con `value: other`     → parámetros reales (Param)
//   - chunks con `queryChunks`      → SQL anidado (and()/eq()/desc())
//   - columnas (PgBoolean/PgUUID…)  → `keyAsName` = nombre de columna
// Recorremos recursivamente para reconstruir SQL + params reales.
type Chunk = string | { value?: unknown; queryChunks?: unknown[]; keyAsName?: string };

function collectSql(x: unknown, accSql: string[], accParams: unknown[]): void {
  if (typeof x === "string") {
    accSql.push(x);
    return;
  }
  if (x === null || typeof x !== "object") return;
  const c = x as Chunk;
  if ("value" in (c as object)) {
    const v = (c as { value: unknown }).value;
    if (Array.isArray(v)) {
      for (const part of v) accSql.push(String(part));
    } else {
      accParams.push(v);
    }
    return;
  }
  if (Array.isArray((c as { queryChunks?: unknown[] }).queryChunks)) {
    for (const chunk of (c as { queryChunks: unknown[] }).queryChunks) collectSql(chunk, accSql, accParams);
    return;
  }
  const colName = (c as { keyAsName?: string | boolean }).keyAsName;
  if (typeof colName === "string") {
    accSql.push(`"${colName}"`);
  } else if (typeof (c as { name?: string }).name === "string") {
    accSql.push(`"${(c as { name: string }).name}"`);
  }
}

function sqlOf(x: unknown): { sql: string; params: unknown[] } {
  const sqlChunks: string[] = [];
  const params: unknown[] = [];
  collectSql(x, sqlChunks, params);
  return { sql: sqlChunks.join(""), params };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Push — boolean `active` semantics (TSK-009)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbResult = [];
    // Sin VAPID keys → sendPushNotification retorna false sin red
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
  });

  it("sendPushNotificationToAll filtra con eq(active, true) — boolean REAL, no string", async () => {
    mockDbResult = [
      { id: "sub-1", subscription: { endpoint: "https://push.example/a" } },
      { id: "sub-2", subscription: { endpoint: "https://push.example/b" } },
    ];

    const result = await sendPushNotificationToAll({ title: "Alerta", body: "test" });

    // Sin VAPID keys: ambos envíos fallan (sin red) → marcados inactivos
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(2);

    // El WHERE de la selección apunta a la columna `active` y su param es el
    // boolean `true` real (no el string 'true' legacy)
    const selectSql = sqlOf(captureWhere.mock.calls[0]![0]);
    expect(selectSql.sql).toContain("active");
    expect(selectSql.params).toContain(true);
    expect(selectSql.params).not.toContain("true");

    // La limpieza de endpoints expirados escribe `active: false` boolean
    const setArg = captureSet.mock.calls[0]![0] as { active: unknown };
    expect(setArg.active).toBe(false);
    expect(typeof setArg.active).toBe("boolean");
  });

  it("sendPushNotificationToUser combina userId + eq(active, true) en and()", async () => {
    mockDbResult = [
      { id: "sub-9", subscription: { endpoint: "https://push.example/user" } },
    ];

    const result = await sendPushNotificationToUser("user-42", { title: "Hola", body: "test" });

    expect(result.failed).toBe(1);

    const whereSql = sqlOf(captureWhere.mock.calls[0]![0]);
    expect(whereSql.sql).toContain("active");
    expect(whereSql.params).toContain(true);
    expect(whereSql.params).not.toContain("true");
    expect(whereSql.sql).toContain("user_id");
  });

  it("con 0 suscripciones activas no escribe nada (early return)", async () => {
    mockDbResult = [];

    const result = await sendPushNotificationToAll({ title: "Nada", body: "x" });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(captureSet).not.toHaveBeenCalled();
  });
});
