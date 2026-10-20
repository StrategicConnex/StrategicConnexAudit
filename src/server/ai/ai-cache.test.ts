import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSemanticKey,
  getSemanticCache,
  setSemanticCache,
  invalidateCacheScope,
  ttlFor,
} from "./ai-cache";

const MSGS = [{ role: "user", content: "hola mundo" }] as const;

describe("ai-cache — caché semántica (P1-3)", () => {
  it("la clave depende de los mensajes completos, no solo del final", async () => {
    const a = buildSemanticKey("general-chat", "s", [
      { role: "user", content: "contexto distinto al inicio, misma cola final XXX" },
    ]);
    const b = buildSemanticKey("general-chat", "s", [
      { role: "user", content: "otro contexto totalmente diferente, misma cola final XXX" },
    ]);
    expect(a).not.toBe(b);
  });

  it("mismo input = misma clave (determinista)", () => {
    const a = buildSemanticKey("seo-report", "p1:2026-01-01", [...MSGS]);
    const b = buildSemanticKey("seo-report", "p1:2026-01-01", [...MSGS]);
    expect(a).toBe(b);
  });

  it("el scope separa proyectos/días", () => {
    const a = buildSemanticKey("seo-report", "p1:2026-01-01", [...MSGS]);
    const b = buildSemanticKey("seo-report", "p2:2026-01-01", [...MSGS]);
    expect(a).not.toBe(b);
  });

  it("set + get en memoria (sin Redis en test)", async () => {
    const key = buildSemanticKey("general-chat", "t1", [...MSGS]);
    expect(await getSemanticCache(key)).toBeNull();
    await setSemanticCache(key, "contenido", "modelo-x", "general-chat");
    expect(await getSemanticCache(key)).toEqual({ content: "contenido", modelId: "modelo-x" });
  });

  it("TTL: seo-report 24h, resto 1h", () => {
    expect(ttlFor("seo-report")).toBe(86400);
    expect(ttlFor("general-chat")).toBe(3600);
    expect(ttlFor("incident-brief")).toBe(3600);
  });
});

// ─── Conector L2 distribuido (6.2 — aprobado condicional C1–C6) ──────────────
// vi.hoisted: el factory de vi.mock corre antes que el body del módulo de test.
const { l2, mocks } = vi.hoisted(() => ({
  l2: new Map<string, { content: string; modelId: string; expiresAt: number }>(),
  mocks: {
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
    deleteByPrefix: vi.fn(async (prefix: string) => {
      let n = 0;
      for (const k of Array.from(l2.keys())) {
        if (k.startsWith(prefix)) { l2.delete(k); n++; }
      }
      return n;
    }),
  },
}));

vi.mock("@/shared/lib/distributed-cache", () => ({
  isDistributedCacheEnabled: () => true,
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
  cacheDeleteByPrefix: mocks.deleteByPrefix,
}));

beforeEach(() => {
  l2.clear();
  mocks.cacheGet.mockReset();
  mocks.cacheSet.mockReset();
  mocks.deleteByPrefix.mockClear();
  mocks.cacheGet.mockImplementation(async (key: string) => l2.get(key));
  mocks.cacheSet.mockImplementation(async (key: string, value: unknown) => {
    l2.set(key, value as { content: string; modelId: string; expiresAt: number });
  });
});

describe("ai-cache — conector L2 distribuido (6.2)", () => {
  it("sirve desde L1 cuando la entrada está caliente y ESCRIBE también al L2", async () => {
    const key = buildSemanticKey("seo-report", "proj-a:2026-10-20", [
      { role: "user", content: "prompt" },
    ]);
    await setSemanticCache(key, "respuesta", "groq:openai/gpt-oss-120b", "seo-report");
    const hit = await getSemanticCache(key);
    expect(hit).toEqual({ content: "respuesta", modelId: "groq:openai/gpt-oss-120b" });
    expect(l2.has(key)).toBe(true);
  });

  it("sirve desde L2 cuando el L1 está frío (instancia nueva tras deploy)", async () => {
    const key = "ai:seo-report:proj-a:cross:deadbeef"; // nunca pasada por setSemanticCache
    l2.set(key, {
      content: "desde distribuida",
      modelId: "m",
      expiresAt: Date.now() + 60_000,
    });
    const hit = await getSemanticCache(key);
    expect(hit).toEqual({ content: "desde distribuida", modelId: "m" });
  });

  it("L2 expirado NO se sirve (miss limpio)", async () => {
    const key = "ai:seo-report:expired:l2";
    l2.set(key, { content: "viejo", modelId: "m", expiresAt: Date.now() - 1 });
    expect(await getSemanticCache(key)).toBeNull();
  });

  it("fail-open: fallo del L2 en GET → miss, en SET → no lanza (C5)", async () => {
    const key = buildSemanticKey("exec-brief", "proj-a", [{ role: "user", content: "x" }]);
    mocks.cacheGet.mockRejectedValueOnce(new Error("db down"));
    expect(await getSemanticCache(key)).toBeNull();
    mocks.cacheSet.mockRejectedValueOnce(new Error("db down"));
    await expect(
      setSemanticCache(key, "ok", "m", "exec-brief"),
    ).resolves.not.toThrow();
  });

  // ── C1: aislamiento entre tenants ───────────────────────────────────────────
  it("C1 — dos tenants con el MISMO prompt generan keys distintas", () => {
    const msgs = [{ role: "user" as const, content: "Resuma los riesgos" }];
    const keyA = buildSemanticKey("seo-report", "proj-a", msgs);
    const keyB = buildSemanticKey("seo-report", "proj-b", msgs);
    expect(keyA).not.toBe(keyB);
    expect(keyA.startsWith("ai:seo-report:proj-a")).toBe(true);
    expect(keyB.startsWith("ai:seo-report:proj-b")).toBe(true);
  });

  it("C1 — un hit del tenant A NO se sirve al tenant B", async () => {
    const keyA = "ai:seo-report:proj-a:hash-a";
    l2.set(keyA, { content: "informe de A", modelId: "m", expiresAt: Date.now() + 60_000 });
    expect(await getSemanticCache(keyA)).toEqual({ content: "informe de A", modelId: "m" });
    expect(await getSemanticCache("ai:seo-report:proj-b:hash-b")).toBeNull();
  });

  // ── C1-hardening: guard anti-fuga cross-tenant por scope "global" ────────────
  it("C1 — una key sin tenant (scope global) NUNCA se escribe al L2", async () => {
    const key = "ai:copilot-remediation:global:abc123def4567890"; // callers sin cacheScope
    await setSemanticCache(key, "respuesta con evidencia de un tenant", "m", "copilot-remediation");
    expect(l2.has(key)).toBe(false); // guard: solo L1
    expect(mocks.cacheSet).not.toHaveBeenCalled();
    expect(await getSemanticCache(key)).toEqual({
      content: "respuesta con evidencia de un tenant",
      modelId: "m",
    }); // el L1 SÍ sirve (semántica P1-3 intacta)
  });

  it("C1 — una key DE tenant (scope con ':') SÍ se escribe al L2", async () => {
    const key = buildSemanticKey("seo-report", "proj-a:2026-10-20", [
      { role: "user", content: "p" },
    ]);
    await setSemanticCache(key, "r", "m", "seo-report");
    expect(l2.has(key)).toBe(true);
  });

  // ── C2: cap de TTL del L2 + invalidación on-write ───────────────────────────
  it("C2 — el TTL del L2 nunca supera 1 h aunque la semántica L1 sea 24 h", async () => {
    const key = buildSemanticKey("seo-report", "proj-a:2026-10-20", [
      { role: "user", content: "prompt" },
    ]);
    await setSemanticCache(key, "r", "m", "seo-report"); // ttlFor = 24 h
    const call = mocks.cacheSet.mock.calls.find((c) => c[0] === key);
    expect(call).toBeDefined();
    expect(call![2]).toBeLessThanOrEqual(3_600_000);
  });

  it("C2 — invalidateCacheScope borra L1 y L2 del scope", async () => {
    const scope = "proj-a:2026-10-20";
    const keyA = buildSemanticKey("seo-report", scope, [{ role: "user", content: "a" }]);
    await setSemanticCache(keyA, "r", "m", "seo-report"); // L1 + L2
    const deleted = await invalidateCacheScope("seo-report", "proj-a");
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await getSemanticCache(keyA)).toBeNull(); // L1 fuera y L2 fuera
    expect(l2.has(keyA)).toBe(false);
  });

  // ── C3: la clave nunca contiene el prompt crudo ──────────────────────────────
  it("C3 — la clave es hash truncado: NUNCA contiene el contenido del prompt", () => {
    const key = buildSemanticKey("copilot-remediation", "proj-a", [
      { role: "user", content: "SECRETO-super-hyper-estrictamente-privado" },
    ]);
    expect(key.includes("SECRETO-super")).toBe(false);
  });
});
