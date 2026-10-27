import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAiChat } from "./useAiChat";
import {
  buildIntelligenceMemoryKey,
  loadIntelligenceMemory,
  saveIntelligenceMemory,
} from "../lib/chat-memory";

vi.mock("next-intl", () => {
  const dict: Record<string, string> = {
    greeting: "Hola. Soy tu Asistente de Inteligencia de Red.",
    errorUnavailable: "No se pudo obtener respuesta: {detail}",
    httpError: "Error del asistente (HTTP {status})",
    remediationRequest: "Genera el plan de remediación completo e interactivo para esta auditoría.",
    remediationError: "No se pudo generar el plan: {detail}",
    remediationConnError: "Error de conexión al generar el plan: {detail}",
    commandHelp: "Comandos: /help, /finding <id>",
    commandUnknown: "Comando no reconocido: {command}. Escribe /help.",
    commandFindingUsage: "Uso: /finding <id>.",
    commandFindingUnavailable: "No se encontró el hallazgo.",
  };
  return {
    useTranslations: () => (key: string, values?: Record<string, unknown>) => {
      const template = dict[key] ?? key;
      return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
        String(values?.[name] ?? ""),
      );
    },
  };
});

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAiChat · chat real (Task 0.1)", () => {
  it("envía el mensaje a /api/ai/copilot y anexa la respuesta del modelo", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, message: "Respuesta real del modelo", modelUsed: "test/model" })
    );

    const { result } = renderHook(() =>
      useAiChat({
        projectId: "11111111-1111-4111-8111-111111111111",
        investigationId: "22222222-2222-4222-8222-222222222222",
      }),
    );

    await act(async () => {
      await result.current.sendMessage("¿Qué puertos abiertos tengo?");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ai/copilot");
    expect(init.method).toBe("POST");

    const payload = JSON.parse(String(init.body)) as {
      mode: string;
      intelligenceContext: { projectId?: string; investigationId?: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(payload.mode).toBe("analyst");
    expect(payload.intelligenceContext).toEqual({
      projectId: "11111111-1111-4111-8111-111111111111",
      investigationId: "22222222-2222-4222-8222-222222222222",
    });
    expect(payload.messages.at(-1)).toEqual({
      role: "user",
      content: "¿Qué puertos abiertos tengo?",
    });

    const last = result.current.messages.at(-1);
    expect(last).toEqual({ role: "assistant", text: "Respuesta real del modelo" });
    expect(result.current.isGenerating).toBe(false);
  });

  it("marca como error un 503 del pool y muestra el motivo", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: "AI pool unavailable" }, false, 503)
    );

    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.sendMessage("hola");
    });

    const last = result.current.messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.isError).toBe(true);
    expect(last?.text).toContain("AI pool unavailable");
    expect(result.current.isGenerating).toBe(false);
  });

  it("marca como error un fallo de red", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.sendMessage("hola");
    });

    const last = result.current.messages.at(-1);
    expect(last?.isError).toBe(true);
    expect(last?.text).toContain("network down");
  });

  it("no llama a la API con texto vacío", async () => {
    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(1);
  });
});

describe("useAiChat · plan de remediación honesto (Task 0.11)", () => {
  it("con 0 hallazgos muestra la ausencia y una acción real, sin plan inventado", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        hasFindings: false,
        remediationPlan: "La investigación aún no tiene hallazgos. Inicia un escaneo para generar datos reales.",
        action: {
          href: "/intelligence#intelligence-scan",
          label: "Escanear infraestructura",
        },
      })
    );

    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.requestRemediationPlan("inv-1");
    });

    const last = result.current.messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.isError).toBeUndefined();
    expect(last?.text).toContain("no tiene hallazgos");
    expect(last?.action).toEqual({
      href: "/intelligence#intelligence-scan",
      label: "Escanear infraestructura",
    });
  });

  it("con hallazgos muestra el plan real del modelo y ninguna acción de escaneo", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        hasFindings: true,
        remediationPlan: "# Plan real del modelo",
        modelUsed: "m1",
        fromCache: false,
      })
    );

    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.requestRemediationPlan("inv-1");
    });

    const last = result.current.messages.at(-1);
    expect(last?.text).toBe("# Plan real del modelo");
    expect(last?.action).toBeUndefined();
    expect(last?.isError).toBeUndefined();
  });

  it("un 500 del endpoint se muestra como error, nunca como plan", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: "db down" }, false, 500)
    );

    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.requestRemediationPlan("inv-1");
    });

    const last = result.current.messages.at(-1);
    expect(last?.isError).toBe(true);
    expect(last?.text).toContain("db down");
    expect(last?.action).toBeUndefined();
  });
});

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const INVESTIGATION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_INVESTIGATION_ID = "55555555-5555-4555-8555-555555555555";
const FINDING_ID = "33333333-3333-4333-8333-333333333333";

function memoryKey(investigationId = INVESTIGATION_ID) {
  return buildIntelligenceMemoryKey({
    mode: "analyst",
    projectId: PROJECT_ID,
    investigationId,
  });
}

describe("useAiChat · comandos locales (Sprint 2, C2)", () => {
  it("/help responde localmente sin fetch y queda en el log", async () => {
    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.sendMessage("/help");
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages.at(-2)).toEqual({ role: "user", text: "/help" });
    expect(result.current.messages.at(-1)?.text).toContain("Comandos");
    expect(result.current.isGenerating).toBe(false);
  });

  it("un slash desconocido responde localmente y remite a /help sin fetch", async () => {
    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.sendMessage("/foo");
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages.at(-1)?.text).toContain("Comando no reconocido: /foo");
    expect(result.current.messages.at(-1)?.text).toContain("/help");
  });

  it("/finding sin ID o con ID malformado no llama al servidor", async () => {
    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.sendMessage("/finding");
      await result.current.sendMessage("/finding no-es-uuid");
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages.at(-1)?.text).toBe("Uso: /finding <id>.");
    expect(result.current.isGenerating).toBe(false);
  });

  it("/finding con UUID envía solo el ID como contexto", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, message: "Análisis del hallazgo" })
    );
    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await result.current.sendMessage(`/finding ${FINDING_ID}`);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      intelligenceContext: Record<string, string>;
      messages: Array<{ role: string; content: string }>;
    };
    expect(payload.intelligenceContext).toEqual({
      projectId: PROJECT_ID,
      investigationId: INVESTIGATION_ID,
      findingId: FINDING_ID,
    });
    expect(Object.keys(payload.intelligenceContext).sort()).toEqual([
      "findingId",
      "investigationId",
      "projectId",
    ]);
    expect(payload.messages.at(-1)?.content).toBe(`/finding ${FINDING_ID}`);
  });

  it("un hallazgo ajeno o inexistente (404) se muestra con un error genérico", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: "Recurso de Intelligence no encontrado o acceso denegado" }, false, 404)
    );
    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await result.current.sendMessage(`/finding ${FINDING_ID}`);
    });

    const last = result.current.messages.at(-1);
    expect(last?.isError).toBe(true);
    expect(last?.text).toBe("No se encontró el hallazgo.");
    expect(last?.text).not.toContain("Recurso de Intelligence");
  });
});

describe("useAiChat · memoria v2 (Sprint 2, C2)", () => {
  it("persiste la conversación completada y la restaura al remontar el hook", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, message: "Respuesta guardada" })
    );
    const context = { projectId: PROJECT_ID, investigationId: INVESTIGATION_ID };
    const first = renderHook(() => useAiChat(context));

    await act(async () => {
      await first.result.current.sendMessage("hola");
    });

    expect(loadIntelligenceMemory(memoryKey())).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "Respuesta guardada" },
    ]);

    first.unmount();
    const second = renderHook(() => useAiChat(context));
    const texts = second.result.current.messages.map((m) => m.text);

    expect(texts).toContain("hola");
    expect(texts).toContain("Respuesta guardada");
  });

  it("aísla la memoria por investigación", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, message: "Solo contexto A" })
    );
    const first = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await first.result.current.sendMessage("contexto A");
    });
    first.unmount();

    const other = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: OTHER_INVESTIGATION_ID }),
    );
    expect(other.result.current.messages).toHaveLength(1);
    other.unmount();

    const restored = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );
    expect(restored.result.current.messages.map((m) => m.text)).toContain("contexto A");
  });

  it("no persiste mensajes de error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: "pool caído" }, false, 503)
    );
    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await result.current.sendMessage("hola");
    });

    expect(loadIntelligenceMemory(memoryKey())).toEqual([
      { role: "user", content: "hola" },
    ]);
  });

  it("envía como máximo 10 mensajes y redacta la historia saliente", async () => {
    const seeded = Array.from({ length: 11 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: i === 9 ? "contacto ana@acme.com" : `m-${i}`,
    }));
    saveIntelligenceMemory(memoryKey(), seeded);
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, message: "ok" }));

    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await result.current.sendMessage("nueva pregunta");
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const joined = payload.messages.map((m) => m.content).join("\n");

    expect(payload.messages.length).toBeLessThanOrEqual(10);
    expect(joined).toContain("[EMAIL]");
    expect(joined).not.toContain("ana@acme.com");
    expect(joined).toContain("nueva pregunta");
    expect(joined.length).toBeLessThanOrEqual(8_000);
  });

  it("clearChat borra solo la memoria del contexto activo", async () => {
    saveIntelligenceMemory(memoryKey(), [{ role: "user", content: "efímero" }]);
    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );
    expect(result.current.messages.map((m) => m.text)).toContain("efímero");

    act(() => {
      result.current.clearChat();
    });

    expect(window.localStorage.getItem(memoryKey())).toBeNull();
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.text).toBe("Hola. Soy tu Asistente de Inteligencia de Red.");
  });
});
