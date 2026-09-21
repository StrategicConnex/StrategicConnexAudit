import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * sprint1.test.ts — Tests del Sprint 1 del roadmap IA:
 *   #15 self-healing JSON  ·  #17 coste/tokens  ·  #18 prompt versioning
 */

// ─── #18 prompt-version ──────────────────────────────────────────────────────

import { promptVersion } from "./prompt-version";

describe("prompt-version (#18)", () => {
  it("misma llamada = misma versión (determinista)", () => {
    const msgs = [{ role: "system" as const, content: "sys" }, { role: "user" as const, content: "hola" }];
    expect(promptVersion(msgs)).toBe(promptVersion([...msgs]));
  });

  it("cambiar el contenido del prompt cambia la versión", () => {
    const a = promptVersion([{ role: "user", content: "v1" }]);
    const b = promptVersion([{ role: "user", content: "v2" }]);
    expect(a).not.toBe(b);
  });

  it("no depende del orden de propiedades ni de longitud fija distinta de 16 hex", () => {
    const v = promptVersion([{ role: "user", content: "x" }]);
    expect(v).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ─── #17 ai-cost ─────────────────────────────────────────────────────────────

import { estimateCostUsd } from "./ai-cost";

describe("ai-cost (#17)", () => {
  it("modelos :free y openrouter/free cuestan 0 aunque reporten tokens", () => {
    expect(estimateCostUsd("nvidia/nemotron-3-super-120b-a12b:free", 1000, 500)).toBe(0);
    expect(estimateCostUsd("openrouter/free", 1000, 500)).toBe(0);
  });

  it("modelo conocido de pago: tokens × precio (in y out)", () => {
    // claude haiku: $0.8/1M in, $4/1M out
    const cost = estimateCostUsd("anthropic/claude-3-5-haiku-20241022", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(4.8, 6);
  });

  it("sin usage → 0 (no se inventan tokens)", () => {
    expect(estimateCostUsd("anthropic/claude-3-5-haiku-20241022", null, null)).toBe(0);
    expect(estimateCostUsd("desconocido/pago", 1000, 1000)).toBe(0);
  });
});

// ─── #16 ai-cache: métricas + invalidación por scope ────────────────────────

import {
  buildSemanticKey,
  setSemanticCache,
  getSemanticCache,
  invalidateCacheScope,
  cacheMetrics,
  resetCacheMetrics,
} from "./ai-cache";

describe("ai-cache — métricas e invalidación (#16)", () => {
  beforeEach(() => resetCacheMetrics());

  it("hit-rate se calcula sobre hits+misses", async () => {
    const key = buildSemanticKey("general-chat", "m1", [{ role: "user", content: `x-${Date.now()}` }]);
    await getSemanticCache(key); // miss
    await setSemanticCache(key, "c", "m", "general-chat");
    await getSemanticCache(key); // hit
    const m = cacheMetrics();
    expect(m.hits).toBe(1);
    expect(m.misses).toBeGreaterThanOrEqual(1);
    expect(m.hitRate).toBeGreaterThan(0);
  });

  it("invalidateCacheScope borra solo las claves del scope", async () => {
    const scope = `inv-${Date.now()}`;
    const k1 = buildSemanticKey("seo-report", scope, [{ role: "user", content: "a" }]);
    const k2 = buildSemanticKey("seo-report", scope, [{ role: "user", content: "b" }]);
    const other = buildSemanticKey("seo-report", "otro-scope", [{ role: "user", content: "a" }]);
    await setSemanticCache(k1, "1", "m", "seo-report");
    await setSemanticCache(k2, "2", "m", "seo-report");
    await setSemanticCache(other, "3", "m", "seo-report");

    const deleted = await invalidateCacheScope("seo-report", scope);
    expect(deleted).toBe(2);
    expect(await getSemanticCache(k1)).toBeNull();
    expect(await getSemanticCache(k2)).toBeNull();
    expect(await getSemanticCache(other)).not.toBeNull();
  });
});

// ─── #15 self-healing JSON a través del router ──────────────────────────────

type FetchHandler = (url: string, init: RequestInit) => Promise<Response> | Response;
let fetchHandler: FetchHandler = () => new Response("{}", { status: 200 });

vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const urlStr = String(url);
  if (!urlStr.includes("openrouter.ai")) {
    return new Response("[]", { status: 200 }); // Upstash /pipeline
  }
  return fetchHandler(urlStr, (init ?? {}) as RequestInit);
}));

import { callAIWithFallback } from "./ai-router";

function completionResponse(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("callAIWithFallback — self-healing JSON (#15)", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    fetchHandler = () => new Response("{}", { status: 200 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reintenta al mismo modelo con el error inyectado y recupera el JSON", async () => {
    let calls = 0;
    const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    fetchHandler = (_url, init) => {
      calls++;
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      if (calls === 1) return completionResponse('{"sev": "high"'); // JSON roto
      return completionResponse('{"sev":"high"}'); // corregido
    };

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `sh-${Date.now()}` }],
      responseFormat: { type: "json_object" },
    });

    expect(res.success).toBe(true);
    expect(res.content).toBe('{"sev":"high"}');
    expect(calls).toBe(2);
    // El reintento incluye el feedback de reparación
    const repairMsg = bodies[1]!.messages.find((m) => m.role === "user" && m.content.includes("JSON válido"));
    expect(repairMsg).toBeDefined();
  });

  it("si el self-heal falla, cae al siguiente modelo de la cadena", async () => {
    let calls = 0;
    fetchHandler = () => {
      calls++;
      // Siempre JSON roto: 1ª llamada modelo A (+1 self-heal) → modelo B
      return completionResponse('{"roto": ');
    };

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `sh2-${Date.now()}` }],
      responseFormat: { type: "json_object" },
    });

    // La cadena JSON-crítica de adversary-analysis tiene 2 modelos verificados
    // (ver TASK_ROUTING): ambos reciben llamada + reintento y ambos fallan →
    // el router retorna success=false tras agotar la cadena (4 fetches).
    expect(res.success).toBe(false);
    expect(calls).toBe(4);
    expect(res.error).toContain("JSON inválido tras self-heal");
  });

  it("sin responseFormat no hay self-heal (texto libre intacto)", async () => {
    let calls = 0;
    fetchHandler = () => {
      calls++;
      return completionResponse("texto libre no JSON {roto");
    };

    const res = await callAIWithFallback({
      taskType: "general-chat",
      messages: [{ role: "user", content: `free-${Date.now()}` }],
    });

    expect(res.success).toBe(true);
    expect(res.content).toContain("texto libre");
    expect(calls).toBe(1);
  });

  it("JSON envuelto en markdown se acepta sin self-heal (extracción tolerante)", async () => {
    let calls = 0;
    fetchHandler = () => {
      calls++;
      return completionResponse('```json\n{"ok":true}\n```');
    };

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `md-${Date.now()}` }],
      responseFormat: { type: "json_object" },
    });

    expect(res.success).toBe(true);
    expect(calls).toBe(1);
  });
});
