/**
 * Tests del AI Router: function calling (tools), bucle agéntico y
 * registro de tools con validación Zod.
 *
 * NOTA: el cliente de Upstash Redis (circuit breaker) también usa global.fetch
 * contra "/pipeline", por lo que el mock filtra SIEMPRE por URL de OpenRouter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type FetchHandler = (url: string, init: RequestInit) => Promise<Response> | Response;
let fetchHandler: FetchHandler = () => new Response("{}", { status: 200 });

vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const urlStr = String(url);
  if (!urlStr.includes("openrouter.ai")) {
    // Upstash /pipeline u otros: respuesta vacía, no nos importa en estos tests
    return new Response("[]", { status: 200 });
  }
  return fetchHandler(urlStr, (init ?? {}) as RequestInit);
}));

import { callAIWithFallback, callAIAgentLoop } from "./ai-router";
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