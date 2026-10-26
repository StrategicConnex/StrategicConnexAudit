/**
 * Tests de callAIWithFallbackStream (Sprint 1 chatbot: streaming).
 *
 * Mismo patrón de mocks que ai-router.test.ts: fetch global despachado por
 * URL de proveedor; claves vía vi.stubEnv. Cada handler SSE se construye con
 * `sseResponse` para devolver el formato OpenAI real (data: {...} / [DONE]).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Evidencias Sprint 1: la telemetría (A2) y la escritura de caché se miden
// con spies. Los módulos se mockean PARCIALES: el resto de sus exports
// (getSemanticCache, assertAiQuota…) sigue siendo el real.
vi.mock("./ai-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai-usage")>();
  return { ...actual, recordAiUsage: vi.fn() };
});
vi.mock("./ai-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai-cache")>();
  // Envuelve el real: los tests que siembran la caché siguen funcionando.
  return { ...actual, setSemanticCache: vi.fn(actual.setSemanticCache) };
});

type FetchHandler = (url: string, init: RequestInit) => Promise<Response> | Response;
let fetchHandler: FetchHandler = () => new Response("{}", { status: 200 });
let groqHandler: FetchHandler = () => new Response("failover groq no esperado", { status: 500 });
let geminiHandler: FetchHandler = () => new Response("failover gemini no esperado", { status: 500 });
let groqCalls = 0;
let geminiCalls = 0;

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes("openrouter.ai")) return fetchHandler(urlStr, (init ?? {}) as RequestInit);
    if (urlStr.includes("groq.com")) {
      groqCalls++;
      return groqHandler(urlStr, (init ?? {}) as RequestInit);
    }
    if (urlStr.includes("generativelanguage.googleapis.com")) {
      geminiCalls++;
      return geminiHandler(urlStr, (init ?? {}) as RequestInit);
    }
    return new Response("[]", { status: 200 });
  }),
);

import { callAIWithFallbackStream } from "./ai-router";
import { buildSemanticKey, setSemanticCache } from "./ai-cache";
import { recordAiUsage } from "./ai-usage";
import { resetAllCircuits } from "@/shared/lib/circuit-breaker";

const usageMock = recordAiUsage as unknown as ReturnType<typeof vi.fn>;
const cacheWriteMock = setSemanticCache as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Los tests "todo caído" abren el breaker de OpenRouter con sus 500s
  // seguidos; sin este reset, los tests siguientes fallarían en rápido
  // (mismo criterio que ai-router.chaos.test.ts).
  resetAllCircuits();
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
  fetchHandler = () => new Response("upstream no esperado", { status: 500 });
  groqHandler = () => new Response("failover groq no esperado", { status: 500 });
  geminiHandler = () => new Response("failover gemini no esperado", { status: 500 });
  groqCalls = 0;
  geminiCalls = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── Helpers SSE ────────────────────────────────────────────────────────────

function deltaEvent(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`;
}

function usageEvent(): string {
  return `data: ${JSON.stringify({ usage: { prompt_tokens: 11, completion_tokens: 7 } })}`;
}

const DONE_EVENT = "data: [DONE]";

/** Body SSE en un solo chunk (suficiente para estos tests). */
function sseResponse(events: string[]): Response {
  const payload = events.join("\n\n") + "\n\n";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function userMessages(tag: string) {
  return [{ role: "user" as const, content: `hola ${tag}-${Date.now()}` }];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("callAIWithFallbackStream — camino feliz", () => {
  it("emite los deltas en orden, acumula el contenido y pide stream:true", async () => {
    let requestBody: Record<string, unknown> | null = null;
    fetchHandler = (_url, init) => {
      requestBody = JSON.parse(init.body as string);
      return sseResponse([deltaEvent("Hola "), deltaEvent("mundo"), usageEvent(), DONE_EVENT]);
    };

    const chunks: string[] = [];
    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("stream-ok"), userId: "u-1" },
      (text) => chunks.push(text),
    );

    expect(chunks).toEqual(["Hola ", "mundo"]);
    expect(res.success).toBe(true);
    expect(res.content).toBe("Hola mundo");
    expect(res.modelUsed).toBe("openrouter/free"); // primer modelo de la cadena
    expect(res.fromCache).toBeUndefined();
    // El body debe viajar con stream:true + usage del gateway de OpenRouter.
    expect(requestBody?.stream).toBe(true);
    expect(requestBody?.usage).toEqual({ include: true });
  });

  it("respuesta en caché → replay en un solo chunk sin tocar la red", async () => {
    const messages = userMessages("stream-cache");
    const scope = "user:u-cache";
    const key = buildSemanticKey("general-chat", scope, messages);
    await setSemanticCache(key, "respuesta cacheada", "m1", "general-chat");

    const chunks: string[] = [];
    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages, cacheScope: scope, userId: "u-cache" },
      (text) => chunks.push(text),
    );

    expect(res.success).toBe(true);
    expect(res.fromCache).toBe(true);
    expect(res.content).toBe("respuesta cacheada");
    expect(chunks).toEqual(["respuesta cacheada"]);
    // Ni un fetch: la caché interceptó la llamada.
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("callAIWithFallbackStream — fallback entre modelos", () => {
  it("modelo con HTTP 500 (sin chunks) → cae al siguiente de la cadena", async () => {
    let openRouterCalls = 0;
    fetchHandler = () => {
      openRouterCalls++;
      if (openRouterCalls === 1) return new Response("boom", { status: 500 });
      return sseResponse([deltaEvent("recuperado"), DONE_EVENT]);
    };

    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("stream-fb") },
      () => {},
    );

    expect(res.success).toBe(true);
    expect(res.content).toBe("recuperado");
    // Segundo modelo de la cadena general-chat (tras openrouter/free).
    expect(res.modelUsed).toBe("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free");
    expect(openRouterCalls).toBe(2);
  });

  it("error EMBEBIDO en HTTP 200 sin contenido → el modelo falla y sigue la cadena", async () => {
    let openRouterCalls = 0;
    fetchHandler = () => {
      openRouterCalls++;
      if (openRouterCalls === 1) {
        // El 502 embebido de Nvidia visto en producción (HTTP 200 + error).
        return sseResponse([
          `data: ${JSON.stringify({ error: { message: "upstream 502" } })}`,
          DONE_EVENT,
        ]);
      }
      return sseResponse([deltaEvent("tras el fallo"), DONE_EVENT]);
    };

    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("stream-embedded") },
      () => {},
    );

    expect(res.success).toBe(true);
    expect(res.content).toBe("tras el fallo");
    expect(openRouterCalls).toBe(2);
  });

  it("stream cortado a mitad (error tras chunks) → parcial + success:false, sin reintentar", async () => {
    let openRouterCalls = 0;
    fetchHandler = () => {
      openRouterCalls++;
      return sseResponse([
        deltaEvent("par"),
        deltaEvent("cial"),
        `data: ${JSON.stringify({ error: { message: "conexion muerta" } })}`,
      ]);
    };

    const chunks: string[] = [];
    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("stream-cut") },
      (t) => chunks.push(t),
    );

    expect(res.success).toBe(false);
    expect(res.content).toBe("parcial"); // el texto entregado se conserva
    expect(res.error).toContain("Stream interrumpido");
    expect(chunks).toEqual(["par", "cial"]);
    // Un solo intento: con texto ya entregado NO se cambia de modelo.
    expect(openRouterCalls).toBe(1);
  });

  it("modelo que responde 200 sin ningún delta → vacío, sigue la cadena", async () => {
    let openRouterCalls = 0;
    fetchHandler = () => {
      openRouterCalls++;
      if (openRouterCalls === 1) return sseResponse([DONE_EVENT]);
      return sseResponse([deltaEvent("ok final"), DONE_EVENT]);
    };

    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("stream-empty") },
      () => {},
    );

    expect(res.success).toBe(true);
    expect(res.content).toBe("ok final");
    expect(openRouterCalls).toBe(2);
  });
});

describe("callAIWithFallbackStream — failover inter-proveedor", () => {
  it("cadena OpenRouter agotada → Groq sirve el stream de failover", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    fetchHandler = () => new Response("boom", { status: 500 });
    groqHandler = () => sseResponse([deltaEvent("PONG streaming desde groq"), DONE_EVENT]);

    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("stream-groq") },
      () => {},
    );

    expect(res.success).toBe(true);
    expect(res.modelUsed).toBe("groq:openai/gpt-oss-120b");
    expect(res.content).toBe("PONG streaming desde groq");
    expect(groqCalls).toBe(1);
    expect(geminiCalls).toBe(0); // Groq sirvió: Gemini ni alcanzado
  });

  it("sin ninguna clave → onboarding (mismo mensaje que el no-stream)", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    vi.stubEnv("GROQ_API_KEY", undefined);
    vi.stubEnv("GEMINI_API_KEY", undefined);

    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("stream-nokeys") },
      () => {},
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain("ninguna clave de IA configurada");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("todo caído → success:false con 'OpenRouter no disponible' y errores encadenados", async () => {
    fetchHandler = () => new Response("boom", { status: 500 });

    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("stream-allfail") },
      () => {},
    );

    expect(res.success).toBe(false);
    expect(res.content).toBe("");
    expect(res.error).toContain("OpenRouter no disponible");
    expect(res.error).toContain("500");
  });

  it("modelOverride NO activa failover: mide al modelo real o falla", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    fetchHandler = () => new Response("boom", { status: 500 });

    const res = await callAIWithFallbackStream(
      {
        taskType: "general-chat",
        messages: userMessages("stream-eval"),
        modelOverride: "nvidia/nemotron-3.5-lightning:free",
      },
      () => {},
    );

    expect(res.success).toBe(false);
    expect(res.modelUsed).toBe("nvidia/nemotron-3.5-lightning:free");
    expect(res.error).not.toContain("groq");
  });

  it("rechaza tools/responseFormat (solo chat de texto)", async () => {
    await expect(
      callAIWithFallbackStream(
        {
          taskType: "general-chat",
          messages: userMessages("stream-tools"),
          tools: [
            { type: "function", function: { name: "x", description: "d", parameters: {} } },
          ],
        },
        () => {},
      ),
    ).rejects.toThrow(/no soporta tools/);
  });
});

// ─── Evidencia A2 — ttft_ms + streamed en ai_usage ──────────────────────────

describe("callAIWithFallbackStream — telemetría A2 (ttft_ms + streamed)", () => {
  it("stream con chunks → streamed=true y ttft_ms ≤ latency_ms", async () => {
    fetchHandler = () => sseResponse([deltaEvent("hola "), deltaEvent("mundo"), DONE_EVENT]);

    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("a2-streamed"), userId: "u-a2" },
      () => {},
    );

    expect(res.success).toBe(true);
    expect(usageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: "general-chat",
        streamed: true,
        ttftMs: expect.any(Number),
        latencyMs: expect.any(Number),
      }),
    );
    const entry = usageMock.mock.calls.at(-1)?.[0] as {
      ttftMs: number;
      latencyMs: number;
    };
    expect(entry.ttftMs).toBeGreaterThanOrEqual(0);
    expect(entry.ttftMs).toBeLessThanOrEqual(entry.latencyMs);
  });

  it("todo falla sin ningún chunk entregado → streamed=false y ttft_ms null", async () => {
    fetchHandler = () => new Response("boom", { status: 500 });

    await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("a2-nochunk") },
      () => {},
    );

    expect(usageMock).toHaveBeenCalledWith(
      expect.objectContaining({ streamed: false, ttftMs: null, success: false }),
    );
  });

  it("respuesta en caché → streamed=true con ttft ~0 (replay instantáneo)", async () => {
    const messages = userMessages("a2-cache");
    const scope = "user:u-a2-cache";
    await setSemanticCache(buildSemanticKey("general-chat", scope, messages), "ok", "m1", "general-chat");

    await callAIWithFallbackStream(
      { taskType: "general-chat", messages, cacheScope: scope, userId: "u-a2-cache" },
      () => {},
    );

    expect(usageMock).toHaveBeenCalledWith(
      expect.objectContaining({ fromCache: true, streamed: true, ttftMs: expect.any(Number) }),
    );
  });
});

// ─── Evidencia 3 — la caché SOLO se escribe con el stream completo ───────────

describe("callAIWithFallbackStream — caché solo al stream completo", () => {
  it("corte a mitad → setSemanticCache NO llamado (nunca se cachea un parcial)", async () => {
    cacheWriteMock.mockClear();
    fetchHandler = () =>
      sseResponse([
        deltaEvent("parcial "),
        `data: ${JSON.stringify({ error: { message: "conexion muerta" } })}`,
      ]);

    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("cache-cut"), userId: "u-cut" },
      () => {},
    );

    expect(res.success).toBe(false);
    expect(res.content).toContain("parcial");
    expect(cacheWriteMock).not.toHaveBeenCalled();
  });

  it("control: stream completo SÍ escribe la caché una sola vez", async () => {
    cacheWriteMock.mockClear();
    fetchHandler = () => sseResponse([deltaEvent("respuesta completa"), usageEvent(), DONE_EVENT]);

    const res = await callAIWithFallbackStream(
      { taskType: "general-chat", messages: userMessages("cache-full"), userId: "u-full" },
      () => {},
    );

    expect(res.success).toBe(true);
    expect(cacheWriteMock).toHaveBeenCalledTimes(1);
    expect(cacheWriteMock.mock.calls[0]?.[1]).toBe("respuesta completa");
  });
});
