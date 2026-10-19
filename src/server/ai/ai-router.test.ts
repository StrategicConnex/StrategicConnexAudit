/**
 * Tests del AI Router: function calling (tools), bucle agéntico y
 * registro de tools con validación Zod.
 *
 * NOTA: el mock filtra SIEMPRE por URL de OpenRouter: cualquier otra
 * petición de red que dispare el código bajo test recibe una respuesta vacía.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type FetchHandler = (url: string, init: RequestInit) => Promise<Response> | Response;
let fetchHandler: FetchHandler = () => new Response("{}", { status: 200 });
// Handlers del failover (Groq/Gemini) + contadores por proveedor.
let groqHandler: FetchHandler = () => new Response("failover groq no esperado", { status: 500 });
let geminiHandler: FetchHandler = () =>
  new Response("failover gemini no esperado", { status: 500 });
let groqCalls = 0;
let geminiCalls = 0;

vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const urlStr = String(url);
  if (urlStr.includes("openrouter.ai")) {
    return fetchHandler(urlStr, (init ?? {}) as RequestInit);
  }
  if (urlStr.includes("groq.com")) {
    groqCalls++;
    return groqHandler(urlStr, (init ?? {}) as RequestInit);
  }
  if (urlStr.includes("generativelanguage.googleapis.com")) {
    geminiCalls++;
    return geminiHandler(urlStr, (init ?? {}) as RequestInit);
  }
  // Otra URL que no sea proveedor IA: respuesta vacía, no nos importa en estos tests
  return new Response("[]", { status: 200 });
}));

import { callAIWithFallback, callAIAgentLoop, modelCapabilities, getNoApiKeyResponse, TASK_ROUTING, MODEL_TIMEOUTS } from "./ai-router";
import { registerTools } from "./tools/registry";
import { z } from "zod";

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function completionResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const TOOL_CALL_BODY = {
  choices: [{
    message: {
      content: null,
      tool_calls: [{ id: "c1", function: { name: "lookup", arguments: '{"key":"tls"}' } }],
    },
  }],
};

describe("callAIWithFallback — tools", () => {
  it("expone toolCalls cuando el modelo responde con tool_calls", async () => {
    fetchHandler = () =>
      completionResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call_1",
              function: { name: "get_data", arguments: '{"id":"abc"}' },
            }],
          },
        }],
      });

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `test-${Date.now()}` }],
      tools: [{
        type: "function",
        function: { name: "get_data", description: "d", parameters: { type: "object" } },
      }],
    });

    expect(res.success).toBe(true);
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls![0]).toMatchObject({ id: "call_1", name: "get_data" });
    // Con tools NO se cachea la respuesta
    expect(res.fromCache).toBeUndefined();
  });
});

describe("callAIAgentLoop — bucle agéntico", () => {
  it("ejecuta el handler real y alimenta el resultado al modelo hasta respuesta final", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let openRouterCalls = 0;
    fetchHandler = (_url, init) => {
      openRouterCalls++;
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      if (openRouterCalls === 1) return completionResponse(TOOL_CALL_BODY);
      return completionResponse({ choices: [{ message: { content: '{"done":true}' } }] });
    };

    const lookup = vi.fn(async (args: unknown) => ({ value: 42, requested: args }));
    const res = await callAIAgentLoop({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `usa la tool ${Date.now()}` }],
      toolHandlers: new Map([["lookup", lookup]]),
      maxIterations: 4,
    });

    expect(res.success).toBe(true);
    expect(res.content).toBe('{"done":true}');
    expect(lookup).toHaveBeenCalledWith({ key: "tls" });
    expect(res.toolInvocations).toEqual([{ name: "lookup", ok: true }]);
    expect(openRouterCalls).toBe(2);

    // Segunda llamada: incluye assistant con tool_calls + resultado role:"tool"
    const secondBody = bodies[1] as { messages: Array<{ role?: string; content?: string; tool_calls?: unknown[] }> };
    const toolMsg = secondBody.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(JSON.parse(toolMsg!.content!)).toEqual({ value: 42, requested: { key: "tls" } });
    const assistantMsg = secondBody.messages.find(
      (m) => m.role === "assistant" && Array.isArray(m.tool_calls)
    );
    expect(assistantMsg).toBeDefined();
  });

  it("devuelve error del handler al modelo y marca la invocación como fallida", async () => {
    let openRouterCalls = 0;
    let toolResultContent = "";
    fetchHandler = (_url, init) => {
      openRouterCalls++;
      if (openRouterCalls === 1) {
        return completionResponse({
          choices: [{
            message: {
              content: null,
              tool_calls: [{ id: "e1", function: { name: "boom", arguments: "{}" } }],
            },
          }],
        });
      }
      const body = JSON.parse(init.body as string);
      const toolMsg = body.messages.find((m: { role?: string }) => m.role === "tool");
      toolResultContent = toolMsg?.content ?? "";
      return completionResponse({ choices: [{ message: { content: "recuperado" } }] });
    };

    const res = await callAIAgentLoop({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `x-${Date.now()}` }],
      toolHandlers: new Map([
        ["boom", async () => { throw new Error("fallo controlado"); }],
      ]),
    });

    expect(res.success).toBe(true);
    expect(res.content).toBe("recuperado");
    expect(JSON.parse(toolResultContent)).toEqual({ error: "fallo controlado" });
    expect(res.toolInvocations).toEqual([{ name: "boom", ok: false }]);
  });

  it("función desconocida → no rompe, informa al modelo", async () => {
    let openRouterCalls = 0;
    fetchHandler = (_url, init) => {
      openRouterCalls++;
      if (openRouterCalls === 1) {
        return completionResponse({
          choices: [{
            message: {
              content: null,
              tool_calls: [{ id: "u1", function: { name: "no_existe", arguments: "{}" } }],
            },
          }],
        });
      }
      const body = JSON.parse(init.body as string);
      const toolMsg = body.messages.find((m: { role?: string }) => m.role === "tool");
      expect(JSON.parse(toolMsg!.content)).toHaveProperty("error", "Función desconocida: no_existe");
      return completionResponse({ choices: [{ message: { content: "ok final" } }] });
    };

    const res = await callAIAgentLoop({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `x-${Date.now()}` }],
      toolHandlers: new Map(),
    });

    expect(res.success).toBe(true);
    expect(res.toolInvocations[0]).toEqual({ name: "no_existe", ok: false });
  });

  it("agota maxIterations sin respuesta final → success:false", async () => {
    fetchHandler = () => completionResponse(TOOL_CALL_BODY);

    const res = await callAIAgentLoop({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `loop-${Date.now()}` }],
      toolHandlers: new Map([["lookup", async () => ({ pong: true })]]),
      maxIterations: 3,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("iteraciones");
  });
});

describe("registerTools — validación Zod + schema JSON", () => {
  it("valida argumentos antes de ejecutar el handler", async () => {
    const { toolDefs, handlers } = registerTools([
      {
        name: "get_evidence",
        description: "evidencia por check",
        parameters: z.object({
          assessmentId: z.string().uuid(),
          checkId: z.string().max(10).optional(),
        }),
        handler: async (args: { checkId?: string }) => ({ received: args.checkId ?? null }),
      },
    ] as never);

    expect(toolDefs).toHaveLength(1);
    expect(toolDefs[0]!.function.name).toBe("get_evidence");
    // Zod→JSON Schema
    expect((toolDefs[0]!.function.parameters as { type?: string }).type).toBe("object");

    const h = handlers.get("get_evidence")!;

    // Argumentos inválidos → throw descriptivo (el loop lo devuelve al modelo)
    await expect(h({ assessmentId: "no-es-uuid" })).rejects.toThrow(/Argumentos inválidos/);
    // Argumentos válidos → ejecuta
    const out = (await h({ assessmentId: "00000000-0000-4000-8000-000000000000", checkId: "tls" })) as { received: string | null };
    expect(out).toEqual({ received: "tls" });
  });

  it("aplica timeout a handlers colgados", async () => {
    const { handlers } = registerTools([
      {
        name: "slow",
        description: "lento",
        parameters: z.object({}),
        timeoutMs: 50,
        handler: async () => new Promise((r) => setTimeout(r, 5_000)),
      },
    ] as never);

    await expect(handlers.get("slow")!({})).rejects.toThrow(/excedió 50ms/);
  });
});

describe("modelCapabilities", () => {
  it("returns capabilities for known models", () => {
    const caps = modelCapabilities("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free");
    expect(caps.supportsTools).toBe(true);
    expect(caps.supportsStructuredOutput).toBe(true);
  });

  it("returns defaults for unknown models", () => {
    const caps = modelCapabilities("unknown/model:free");
    expect(caps.supportsTools).toBe(false);
    expect(caps.supportsStructuredOutput).toBe(false);
  });
});

describe("getNoApiKeyResponse", () => {
  it("returns Spanish message by default", () => {
    const msg = getNoApiKeyResponse("general-chat");
    expect(msg).toContain("OPENROUTER_API_KEY");
    expect(msg).toContain(" gratis");
  });

  it("returns English message when locale is en", () => {
    const msg = getNoApiKeyResponse("general-chat", "en");
    expect(msg).toContain("OPENROUTER_API_KEY");
    expect(msg).toContain("free");
  });

  it("covers all task types", () => {
    const taskTypes = ["copilot-remediation", "incident-brief", "general-chat", "seo-report", "adversary-analysis", "anomaly-narrative"] as const;
    for (const tt of taskTypes) {
      expect(getNoApiKeyResponse(tt)).toBeTruthy();
      expect(getNoApiKeyResponse(tt, "en")).toBeTruthy();
    }
  });
});

// ─── Failover anti-monodependencia (decisión owner 2026-10-19) ─────────────

describe("callAIWithFallback — failover inter-proveedor (Groq → Gemini)", () => {
  beforeEach(() => {
    groqCalls = 0;
    geminiCalls = 0;
    groqHandler = () => new Response("failover groq no esperado", { status: 500 });
    geminiHandler = () => new Response("failover gemini no esperado", { status: 500 });
  });

  const GROQ_BODY = () => ({
    choices: [{ message: { content: "PONG desde groq" } }],
    model: "openai/gpt-oss-120b",
    usage: { prompt_tokens: 81, completion_tokens: 65 },
  });
  const GEMINI_BODY = () => ({
    choices: [{ message: { content: "PONG desde gemini" } }],
    model: "gemini-3.8-flash",
    usage: { prompt_tokens: 14, completion_tokens: 5 },
  });

  it("OpenRouter cae completo → Groq sirve el failover (sin tocar Gemini)", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key"); // determinismo CI:sin keys reales
    fetchHandler = () => new Response("upstream boom", { status: 500 });
    groqHandler = () =>
      new Response(JSON.stringify(GROQ_BODY()), { status: 200, headers: { "Content-Type": "application/json" } });

    const res = await callAIWithFallback({
      taskType: "adversary-analysis", // Trigger.dev: sin cap Vercel
      messages: [{ role: "user", content: `failover-groq-${Date.now()}` }],
    });

    expect(res.success).toBe(true);
    expect(res.content).toBe("PONG desde groq");
    expect(res.modelUsed).toBe("groq:openai/gpt-oss-120b");
    expect(groqCalls).toBe(1);
    expect(geminiCalls).toBe(0);
  });

  it("sin GROQ_API_KEY el proveedor se salta y cae a Gemini", async () => {
    vi.stubEnv("GROQ_API_KEY", undefined);
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    fetchHandler = () => new Response("upstream boom", { status: 500 });
    geminiHandler = () =>
      new Response(JSON.stringify(GEMINI_BODY()), { status: 200, headers: { "Content-Type": "application/json" } });

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `failover-gemini-${Date.now()}` }],
    });

    expect(res.success).toBe(true);
    expect(res.modelUsed).toBe("gemini:gemini-3.8-flash");
    expect(groqCalls).toBe(0); // sin key: ni un byte a la red de Groq
    expect(geminiCalls).toBe(1);
  });

  it("todos los proveedores fallan → success:false con errores de los tres", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    fetchHandler = () => new Response("upstream boom", { status: 500 });
    groqHandler = () => new Response("upstream boom", { status: 500 });
    geminiHandler = () => new Response("upstream boom", { status: 500 });

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `failover-all-fail-${Date.now()}` }],
    });

    expect(res.success).toBe(false);
    expect(res.modelUsed).toBe(TASK_ROUTING["adversary-analysis"].at(-1));
    expect(res.error).toContain("OpenRouter no disponible");
    expect(res.error).toContain("groq 500");
    expect(res.error).toContain("gemini 500");
    expect(groqCalls).toBe(1);
    expect(geminiCalls).toBe(1);
  });

  it("modelOverride (evals) NO activa failover: mide al modelo real o falla", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    fetchHandler = () => new Response("upstream boom", { status: 500 });

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `eval-override-${Date.now()}` }],
      modelOverride: "nvidia/nemotron-3.5-lightning:free",
    });

    expect(res.success).toBe(false);
    expect(res.modelUsed).toBe("nvidia/nemotron-3.5-lightning:free");
    // Failover jamás tocado: los evals no pueden servir respuestas de
    // otro proveedor a producción ni atribuir al modelo evaluado otro id.
    expect(res.error).not.toContain("groq");
    expect(groqCalls).toBe(0);
    expect(geminiCalls).toBe(0);
  });

  it("sin ninguna key de failover el error histórico queda intacto", async () => {
    vi.stubEnv("GROQ_API_KEY", undefined); // CI: sin keys reales
    vi.stubEnv("GEMINI_API_KEY", undefined);
    fetchHandler = () => new Response("upstream boom", { status: 500 });

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: [{ role: "user", content: `failover-off-${Date.now()}` }],
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("OpenRouter no disponible");
    expect(res.error).toContain("sin API key configurada (failover omitido)");
    expect(groqCalls).toBe(0);
    expect(geminiCalls).toBe(0);
  });

  it("JSON roto en el proveedor → self-heal repite AL PROVEEDOR y recupera", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    fetchHandler = () => new Response("upstream boom", { status: 500 });
    let groqAttempt = 0;
    groqHandler = () => {
      groqAttempt++;
      const content = groqAttempt === 1 ? "no es json {broken" : '{"ok":true}';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const res = await callAIWithFallback({
      taskType: "seo-report", // JSON-crítico → entra el self-heal
      messages: [{ role: "user", content: `selfheal-failover-${Date.now()}` }],
      responseFormat: { type: "json_object" },
    });

    expect(res.success).toBe(true);
    expect(res.content).toBe('{"ok":true}');
    expect(res.modelUsed).toBe("groq:openai/gpt-oss-120b");
    expect(groqCalls).toBe(2); // 1ra llamada + 1 reintento de self-heal
  });
});

describe("TASK_ROUTING & MODEL_TIMEOUTS", () => {
  it("has routing for all task types", () => {
    const taskTypes = ["copilot-remediation", "incident-brief", "general-chat", "seo-report", "adversary-analysis", "anomaly-narrative"] as const;
    for (const tt of taskTypes) {
      expect(TASK_ROUTING[tt]).toBeDefined();
      expect(TASK_ROUTING[tt].length).toBeGreaterThan(0);
    }
  });

  it("has timeouts for all task types", () => {
    const taskTypes = ["copilot-remediation", "incident-brief", "general-chat", "seo-report", "adversary-analysis", "anomaly-narrative"] as const;
    for (const tt of taskTypes) {
      expect(MODEL_TIMEOUTS[tt]).toBeGreaterThan(0);
    }
  });

  it("solo encadena modelos :free o el meta-modelo — nunca uno de pago", () => {
    // El pool es una decisión de producto (solo modelos gratuitos), y por eso
    // este guard mira el SUFIJO. `nex-agi/nex-n2.5-pro` se coló sin `:free` y
    // el catálogo de OpenRouter no tiene ninguna variante gratuita de ese
    // modelo: cada cadena que lo llevaba gastaba una posicion en un 404.
    // Este aserto no puede detectar un id retirado del catálogo (eso exige
    // red), pero si detecta que alguien anade un modelo de pago al pool.
    const pagados: string[] = [];
    for (const [taskType, chain] of Object.entries(TASK_ROUTING)) {
      for (const model of chain) {
        if (model === "openrouter/free") continue;
        if (!model.endsWith(":free")) pagados.push(`${taskType} -> ${model}`);
      }
    }
    expect(pagados).toEqual([]);
  });

  it("no repite el mismo modelo dentro de una cadena", () => {
    // Repetir un id solo gasta un intento del circuit breaker en el mismo
    // 404, reduciendo la cobertura real del failover.
    for (const [taskType, chain] of Object.entries(TASK_ROUTING)) {
      expect(new Set(chain).size, `cadena ${taskType} con modelos repetidos`).toBe(chain.length);
    }
  });
});