import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
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

type SseEvent = Record<string, unknown>;

/**
 * Respuesta SSE real (headers + ReadableStream). Con `hang:true` el stream
 * queda abierto tras emitir los eventos y falla cuando se aborta la petición.
 */
function sseResponse(
  events: SseEvent[],
  options: { signal?: AbortSignal; hang?: boolean } = {},
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      if (options.hang) {
        options.signal?.addEventListener("abort", () => {
          controller.error(new DOMException("Aborted", "AbortError"));
        });
      } else {
        controller.close();
      }
    },
  });
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
    body,
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

describe("useAiChat · citas y sugerencias (Sprint 2, C4)", () => {
  function suggestion(fingerprint: string, investigationId: string | null = INVESTIGATION_ID) {
    return {
      fingerprint,
      findingIds: [FINDING_ID],
      investigationId,
      text: "Hay 1 hallazgo crítico reciente. ¿Revisamos el plan?",
      ctaLabel: "Ver plan de remediación",
    };
  }

  it("conserva las citas verificadas y el contador de no verificadas", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        message: "Riesgo [[ref:1]] y un marcador suelto.",
        references: [{ id: FINDING_ID, title: "SPF ausente" }],
        unverifiedCount: 2,
        suggestion: null,
      }),
    );

    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await result.current.sendMessage("¿qué riesgo hay?");
    });

    expect(result.current.messages.at(-1)).toEqual({
      role: "assistant",
      text: "Riesgo [[ref:1]] y un marcador suelto.",
      references: [{ id: FINDING_ID, title: "SPF ausente" }],
      unverifiedCount: 2,
    });
    expect(result.current.suggestion).toBeNull();
  });

  it("muestra la sugerencia una sola vez por contexto dentro de 24 h", async () => {
    const payload = { success: true, message: "ok", suggestion: suggestion("a".repeat(32)) };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await result.current.sendMessage("primera");
    });
    expect(result.current.suggestion?.fingerprint).toBe("a".repeat(32));
    expect(
      window.localStorage.getItem(`scaudit:chat:suggestion:shown:${INVESTIGATION_ID}`),
    ).toContain("a".repeat(32));

    await act(async () => {
      await result.current.sendMessage("segunda");
    });
    expect(result.current.suggestion).toBeNull();
  });

  it("persiste el descarte por fingerprint y deja pasar un conjunto nuevo", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ success: true, message: "ok", suggestion: suggestion("a".repeat(32)) }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: true, message: "ok", suggestion: suggestion("b".repeat(32)) }),
      );

    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await result.current.sendMessage("primera");
    });
    act(() => {
      result.current.dismissSuggestion();
    });

    expect(result.current.suggestion).toBeNull();
    expect(
      window.localStorage.getItem(`scaudit:chat:suggestion:dismissed:${"a".repeat(32)}`),
    ).toBe("1");

    await act(async () => {
      await result.current.sendMessage("segunda");
    });
    expect(result.current.suggestion?.fingerprint).toBe("b".repeat(32));
  });

  it("restaura citas y contador desde la memoria local", () => {
    saveIntelligenceMemory(memoryKey(), [
      { role: "user", content: "¿qué riesgo hay?" },
      {
        role: "assistant",
        content: "Riesgo [[ref:1]]",
        references: [{ id: FINDING_ID, title: "SPF ausente" }],
        unverifiedCount: 1,
      },
    ]);

    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    expect(result.current.messages.at(-1)).toEqual({
      role: "assistant",
      text: "Riesgo [[ref:1]]",
      references: [{ id: FINDING_ID, title: "SPF ausente" }],
      unverifiedCount: 1,
    });
    expect(loadIntelligenceMemory(memoryKey()).at(-1)?.references).toHaveLength(1);
  });
});

describe("useAiChat · streaming SSE (Sprint 2, C6)", () => {
  const INVENTED_FINDING_ID = "99999999-9999-4999-8999-999999999999";

  it("consume chunk/done en una sola burbuja y conserva el contrato del stream", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: "chunk", text: "Riesgo " },
        { type: "chunk", text: "alto" },
        { type: "done", modelUsed: "m1", fromCache: false },
      ]),
    );

    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await result.current.sendMessage("¿qué riesgo hay?");
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages.at(-1)).toEqual({
      role: "assistant",
      text: "Riesgo alto",
      streaming: false,
    });
    expect(result.current.isGenerating).toBe(false);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { stream?: boolean };
    expect(payload.stream).toBe(true);
  });

  it("normaliza solo las citas verificadas y aplica la sugerencia del done", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        {
          type: "chunk",
          text: `Riesgo [[finding:${FINDING_ID}]] e [[finding:${INVENTED_FINDING_ID}]]`,
        },
        {
          type: "done",
          modelUsed: "m1",
          fromCache: false,
          references: [{ id: FINDING_ID, title: "SPF ausente" }],
          unverifiedCount: 1,
          suggestion: {
            fingerprint: "c".repeat(32),
            findingIds: [FINDING_ID],
            investigationId: INVESTIGATION_ID,
            text: "Hay 1 hallazgo crítico reciente.",
            ctaLabel: "Ver plan",
          },
        },
      ]),
    );

    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );

    await act(async () => {
      await result.current.sendMessage("analiza");
    });

    const last = result.current.messages.at(-1);
    expect(last?.text).toBe(
      `Riesgo [[ref:1]] e [[finding:${INVENTED_FINDING_ID}]]`,
    );
    expect(last?.references).toEqual([{ id: FINDING_ID, title: "SPF ausente" }]);
    expect(last?.unverifiedCount).toBe(1);
    expect(result.current.suggestion?.fingerprint).toBe("c".repeat(32));
  });

  it("un error SSE tras el primer delta conserva el parcial como interrumpido", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: "chunk", text: "parcial" },
        { type: "error", message: "conexión muerta" },
      ]),
    );

    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.sendMessage("hola");
    });

    const last = result.current.messages.at(-1);
    expect(last?.text).toBe("parcial");
    expect(last?.streaming).toBe(false);
    expect(last?.interrupted).toBe(true);
    expect(last?.isError).toBeUndefined();
    expect(result.current.isGenerating).toBe(false);
  });

  it("stopGenerating aborta y conserva el parcial, sin convertirlo en éxito", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(
        sseResponse([{ type: "chunk", text: "parcial" }], {
          signal: init.signal ?? undefined,
          hang: true,
        }),
      ),
    );

    const { result } = renderHook(() => useAiChat());
    let pending: Promise<void> = Promise.resolve();

    act(() => {
      pending = result.current.sendMessage("hola");
    });

    await waitFor(() => {
      expect(result.current.messages.at(-1)?.text).toBe("parcial");
    });

    act(() => {
      result.current.stopGenerating();
    });
    await act(async () => {
      await pending;
    });

    const last = result.current.messages.at(-1);
    expect(last?.text).toBe("parcial");
    expect(last?.interrupted).toBe(true);
    expect(last?.streaming).toBe(false);
    expect(result.current.isGenerating).toBe(false);
  });

  it("abortar antes del primer delta no añade una burbuja de error", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(sseResponse([], { signal: init.signal ?? undefined, hang: true })),
    );

    const { result } = renderHook(() => useAiChat());
    let pending: Promise<void> = Promise.resolve();

    act(() => {
      pending = result.current.sendMessage("hola");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.stopGenerating();
    });
    await act(async () => {
      await pending;
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages.at(-1)).toEqual({ role: "user", text: "hola" });
    expect(result.current.isGenerating).toBe(false);
  });

  it("no reenvía como memoria el parcial de un stream interrumpido", async () => {
    let call = 0;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          sseResponse([{ type: "chunk", text: "parcial-no-memoria" }], {
            signal: init.signal ?? undefined,
            hang: true,
          }),
        );
      }
      return Promise.resolve(jsonResponse({ success: true, message: "ok" }));
    });

    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );
    let pending: Promise<void> = Promise.resolve();

    act(() => {
      pending = result.current.sendMessage("primera");
    });
    await waitFor(() => {
      expect(result.current.messages.at(-1)?.text).toBe("parcial-no-memoria");
    });
    act(() => {
      result.current.stopGenerating();
    });
    await act(async () => {
      await pending;
    });

    await act(async () => {
      await result.current.sendMessage("segunda");
    });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const joined = payload.messages.map((m) => m.content).join("\n");
    expect(joined).not.toContain("parcial-no-memoria");
    expect(joined).toContain("segunda");
  });

  it("clearChat durante el stream descarta la conversación y la respuesta en vuelo", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(
        sseResponse([{ type: "chunk", text: "en vuelo" }], {
          signal: init.signal ?? undefined,
          hang: true,
        }),
      ),
    );

    const { result } = renderHook(() =>
      useAiChat({ projectId: PROJECT_ID, investigationId: INVESTIGATION_ID }),
    );
    let pending: Promise<void> = Promise.resolve();

    act(() => {
      pending = result.current.sendMessage("hola");
    });
    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe("en vuelo"));

    act(() => {
      result.current.clearChat();
    });
    await act(async () => {
      await pending;
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.role).toBe("assistant");
    expect(result.current.isGenerating).toBe(false);
  });

  it("remediación con stream:true reconstruye el plan en una sola burbuja", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: "chunk", text: "# Plan" },
        { type: "chunk", text: "\nPaso 1" },
        { type: "done", modelUsed: "m1", fromCache: false },
      ]),
    );

    const { result } = renderHook(() => useAiChat());

    await act(async () => {
      await result.current.requestRemediationPlan("inv-1");
    });

    const last = result.current.messages.at(-1);
    expect(last).toEqual({
      role: "assistant",
      text: "# Plan\nPaso 1",
      streaming: false,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      investigationId: "inv-1",
      stream: true,
    });
  });

  it("remediación abortada conserva el plan parcial como interrumpido", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(
        sseResponse([{ type: "chunk", text: "Paso parcial" }], {
          signal: init.signal ?? undefined,
          hang: true,
        }),
      ),
    );

    const { result } = renderHook(() => useAiChat());
    let pending: Promise<void> = Promise.resolve();

    act(() => {
      pending = result.current.requestRemediationPlan("inv-1");
    });
    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe("Paso parcial"));

    act(() => {
      result.current.stopGenerating();
    });
    await act(async () => {
      await pending;
    });

    const last = result.current.messages.at(-1);
    expect(last?.text).toBe("Paso parcial");
    expect(last?.interrupted).toBe(true);
    expect(result.current.isGenerating).toBe(false);
  });
});
