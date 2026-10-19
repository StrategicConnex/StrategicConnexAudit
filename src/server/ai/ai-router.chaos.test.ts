/**
 * D2 — Chaos / resiliencia del AI Router.
 *
 * Escenario central (§13.2 del v4-audit): **caída de todos los modelos** →
 * el router debe degradar con gracia (success:false + error descriptivo),
 * NUNCA lanzar, NUNCA colgarse y NUNCA dejar de intentar la cadena completa.
 *
 * Se cubre además:
 *   · mezcla de modos de fallo (429 / 402 / 500 / 200 con error embebido /
 *     200 vacío / AbortError) absorbidos todos por el failover;
 *   · circuito abierto por outage sostenido (corta sin llamar a la red);
 *   · recuperación parcial (un modelo del final sí responde);
 *   · degradación sin API key (mensaje contextual, cero red);
 *   · bucle agéntico caótico.
 *
 * El router lee los secretos vía getters de `envSecrets` → process.env en
 * tiempo de llamada, por eso `vi.stubEnv` es suficiente.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Telemetría fuera del camino: evita importar la capa DB.
vi.mock("./ai-usage", () => ({
  recordAiUsage: vi.fn(async () => {}),
  assertAiQuota: vi.fn(async () => null),
}));

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;
let openRouterHandler: Handler = () => new Response("{}", { status: 200 });
let openRouterCalls = 0;
// Handlers del failover (Groq/Gemini): el escenario "solo OpenRouter" es el
// default; el test de failover directo los reconfigura.
let failoverHandler: Handler = () => new Response("[]", { status: 200 });
let failoverCalls = 0;

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes("openrouter.ai")) {
      openRouterCalls++;
      return openRouterHandler(urlStr, (init ?? {}) as RequestInit);
    }
    if (urlStr.includes("groq.com") || urlStr.includes("generativelanguage.googleapis.com")) {
      failoverCalls++;
      return failoverHandler(urlStr, (init ?? {}) as RequestInit);
    }
    return new Response("[]", { status: 200 });
  })
);

import {
  callAIWithFallback,
  callAIAgentLoop,
  getNoApiKeyResponse,
  TASK_ROUTING,
} from "./ai-router";
import { resetAllCircuits } from "@/shared/lib/circuit-breaker";

const ALL_TASKS = Object.keys(TASK_ROUTING) as Array<keyof typeof TASK_ROUTING>;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

/** Mensaje único por test → evita colisiones de caché semántica. */
const uniqueMsg = (tag: string) => [
  { role: "user" as const, content: `${tag}-${Date.now()}-${Math.random()}` },
];

beforeEach(() => {
  resetAllCircuits();
  openRouterCalls = 0;
  failoverCalls = 0;
  openRouterHandler = () => new Response("{}", { status: 200 });
  failoverHandler = () => new Response("[]", { status: 200 });
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
  // Determinismo local: .env.local inyecta claves reales de failover en esta
  // máquina y sin este stub los escenarios "solo OpenRouter" entrarían al
  // failover inter-proveedor. CI no tiene claves, pero el test no debe
  // depender del entorno.
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("D2 — caída total de modelos OpenRouter", () => {
  it("no lanza y agota la cadena completa devolviendo success:false descriptivo", async () => {
    openRouterHandler = () => text(500, "upstream boom");
    const chain = TASK_ROUTING["general-chat"];

    const res = await callAIWithFallback({
      taskType: "general-chat",
      messages: uniqueMsg("chaos-500"),
    });

    expect(res.success).toBe(false);
    expect(res.content).toBe("");
    // Se intentó CADA modelo de la cadena, ni uno más ni uno menos.
    expect(openRouterCalls).toBe(chain.length);
    expect(res.modelUsed).toBe(chain[chain.length - 1]);
    expect(res.error).toContain("OpenRouter no disponible");
    for (const model of chain) expect(res.error, model).toContain(model);
  });

  it("absorbe modos de fallo heterogéneos (429, 402, 500, error embebido y 200 vacío)", async () => {
    const chain = TASK_ROUTING["adversary-analysis"]; // 2 modelos
    const modes: Handler[] = [
      () => text(429, "rate limited"),
      () => text(402, "credits"),
      () => json(200, { error: { code: 502, message: "provider blew up" } }),
      () => json(200, { choices: [{ message: { content: null } }] }),
    ];
    let i = 0;
    openRouterHandler = () => modes[i++ % modes.length]!();

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: uniqueMsg("chaos-mixed"),
    });

    expect(res.success).toBe(false);
    expect(openRouterCalls).toBe(chain.length);
    expect(res.error).toContain("429");
    expect(res.error).toContain("402");
  });

  it("absorbe AbortError / timeout sin propagarlo", async () => {
    openRouterHandler = () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    };
    const chain = TASK_ROUTING["seo-report"];

    const res = await callAIWithFallback({
      taskType: "seo-report",
      messages: uniqueMsg("chaos-timeout"),
    });

    expect(res.success).toBe(false);
    expect(openRouterCalls).toBe(chain.length);
    expect(res.error).toContain("OpenRouter no disponible");
  });

  it("recupera la llamada si un modelo tardío de la cadena responde", async () => {
    const chain = TASK_ROUTING["general-chat"];
    let i = 0;
    openRouterHandler = () => {
      i++;
      if (i < chain.length) return text(503, "down");
      return json(200, { choices: [{ message: { content: "respuesta tardía OK" } }] });
    };

    const res = await callAIWithFallback({
      taskType: "general-chat",
      messages: uniqueMsg("chaos-partial"),
    });

    expect(res.success).toBe(true);
    expect(res.content).toBe("respuesta tardía OK");
    expect(res.modelUsed).toBe(chain[chain.length - 1]);
    expect(openRouterCalls).toBe(chain.length);
  });
});

describe("D2 — circuit breaker bajo outage sostenido", () => {
  it("abre el circuito y deja de tocar la red, sin lanzar nunca", async () => {
    openRouterHandler = () => text(500, "down");

    // Umbral = 5 fallos. Con cadenas de 2 modelos → 3 llamadas lo superan.
    for (const tag of ["cb-1", "cb-2", "cb-3"]) {
      const res = await callAIWithFallback({
        taskType: "adversary-analysis",
        messages: uniqueMsg(tag),
      });
      expect(res.success).toBe(false);
    }

    // El 5º fallo (primer modelo de la 3ª llamada) abre el circuito, así
    // que el 2º modelo de esa misma llamada ya se cortocircuita → 5 fetches.
    const callsWhileClosed = openRouterCalls;
    expect(callsWhileClosed).toBe(5);

    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: uniqueMsg("cb-open"),
    });
    // El circuito abierto corta ANTES de la red: no se hacen más fetch.
    expect(openRouterCalls).toBe(callsWhileClosed);
    expect(res.success).toBe(false);
    expect(res.error).toContain("OpenRouter no disponible");
  });
});

describe("D2 — degradación sin API key (fail-soft)", () => {
  it("sin OPENROUTER_API_KEY devuelve error contextual y cero red", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = await callAIWithFallback({
      taskType: "copilot-remediation",
      messages: uniqueMsg("no-key"),
    });

    expect(res.success).toBe(false);
    expect(res.modelUsed).toBe("none");
    expect(res.error).toContain("OPENROUTER_API_KEY");
    expect(openRouterCalls).toBe(0);
  });

  it("sin OPENROUTER_API_KEY pero con failover key → failover directo, cero red OpenRouter", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    failoverHandler = () =>
      json(200, {
        choices: [{ message: { content: "PONG desde groq" } }],
        model: "openai/gpt-oss-120b",
        usage: { prompt_tokens: 81, completion_tokens: 65 },
      });

    const res = await callAIWithFallback({
      taskType: "copilot-remediation",
      messages: uniqueMsg("no-or-key-failover"),
    });

    expect(res.success).toBe(true);
    expect(res.modelUsed).toBe("groq:openai/gpt-oss-120b");
    expect(res.content).toBe("PONG desde groq");
    expect(openRouterCalls).toBe(0); // sin key: la cadena OpenRouter ni se recorre
    expect(failoverCalls).toBe(1);
  });

  it("getNoApiKeyResponse cubre las 9 tareas en es y en, sin vacíos", () => {
    for (const task of ALL_TASKS) {
      expect(getNoApiKeyResponse(task), task).toBeTruthy();
      expect(getNoApiKeyResponse(task, "en"), `${task} en`).toBeTruthy();
      expect(getNoApiKeyResponse(task, "es"), `${task} es`).toBeTruthy();
    }
  });
});

describe("D2 — bucle agéntico caótico", () => {
  it("con todos los modelos caídos devuelve success:false y no ejecuta handlers", async () => {
    openRouterHandler = () => text(500, "down");
    const handler = vi.fn(async () => ({ ok: true }));

    const res = await callAIAgentLoop({
      taskType: "adversary-analysis",
      messages: uniqueMsg("agent-chaos"),
      toolHandlers: new Map([["lookup", handler]]),
      maxIterations: 4,
    });

    expect(res.success).toBe(false);
    expect(res.content).toBe("");
    expect(handler).not.toHaveBeenCalled();
    expect(res.toolInvocations).toEqual([]);
  });
});
