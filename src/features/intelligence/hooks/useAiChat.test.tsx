import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAiChat } from "./useAiChat";

vi.mock("next-intl", () => {
  const dict: Record<string, string> = {
    greeting: "Hola. Soy tu Asistente de Inteligencia de Red.",
    errorUnavailable: "No se pudo obtener respuesta: {detail}",
    httpError: "Error del asistente (HTTP {status})",
    remediationRequest: "Genera el plan de remediación completo e interactivo para esta auditoría.",
    remediationError: "No se pudo generar el plan: {detail}",
    remediationConnError: "Error de conexión al generar el plan: {detail}",
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
