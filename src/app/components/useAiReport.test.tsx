import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAiReport } from "./useAiReport";

const fetchMock = vi.hoisted(() => vi.fn());
const clipboardMock = vi.hoisted(() => ({ writeText: vi.fn(async () => {}) }));

describe("useAiReport — generación de informe ejecutivo", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", { value: clipboardMock, configurable: true });
    clipboardMock.writeText.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("estado inicial: sin generar, progreso 0", () => {
    const { result } = renderHook(() => useAiReport("p1"));
    expect(result.current.state.isGenerating).toBe(false);
    expect(result.current.state.progress).toBe(0);
    expect(result.current.state.text).toBe("");
  });

  it("generate sin projectId no hace fetch", async () => {
    const { result } = renderHook(() => useAiReport(""));
    await act(async () => {
      await result.current.generate();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("generate exitoso: progreso 100, texto del reporte y isFallback del backend", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, report: "# Informe", isFallback: false }),
    });
    const { result } = renderHook(() => useAiReport("p1"));

    await act(async () => {
      await result.current.generate();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/report",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.current.state.progress).toBe(100);
    expect(result.current.state.text).toBe("# Informe");
    expect(result.current.state.isGenerating).toBe(false);
    expect(result.current.state.status).toContain("éxito");
  });

  it("genera el primer estado de progreso 5 e Inicializando", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((r) => { resolveFetch = r; }));
    const { result } = renderHook(() => useAiReport("p1"));

    let promise: Promise<void>;
    act(() => {
      promise = result.current.generate();
    });

    expect(result.current.state.isGenerating).toBe(true);
    expect(result.current.state.progress).toBe(5);
    expect(result.current.state.status).toContain("Inicializando");

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, report: "x" }) });
      await promise;
    });
  });

  it("HTTP error: muestra el mensaje del servidor y detiene la generación", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "servicio ocupado" }),
    });
    const { result } = renderHook(() => useAiReport("p1"));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.state.isGenerating).toBe(false);
    expect(result.current.state.status).toContain("servicio ocupado");
    expect(result.current.state.progress).toBe(0);
  });

  it("success sin report: muestra 'llegó vacío' sin progreso 100", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, report: null }),
    });
    const { result } = renderHook(() => useAiReport("p1"));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.state.progress).toBe(0);
    expect(result.current.state.status).toContain("vacío");
  });

  it("error de red: status 'Error de conexión.'", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useAiReport("p1"));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.state.isGenerating).toBe(false);
    expect(result.current.state.status).toBe("Error de conexión.");
  });

  it("abort por timeout: mensaje de servidor lento", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));
    const { result } = renderHook(() => useAiReport("p1"));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.state.status).toContain("tardó demasiado");
  });

  it("copyToClipboard copia el texto y resetea isCopied a los 2s", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, report: "contenido", isFallback: false }),
    });
    const { result } = renderHook(() => useAiReport("p1"));
    await act(async () => {
      await result.current.generate();
    });

    await act(async () => {
      await result.current.copyToClipboard();
    });
    expect(clipboardMock.writeText).toHaveBeenCalledWith("contenido");
    expect(result.current.state.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2001);
    });
    expect(result.current.state.isCopied).toBe(false);
  });

  it("generate con isFallback=true propaga el flag", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, report: "# fallback", isFallback: true }),
    });
    const { result } = renderHook(() => useAiReport("p1"));
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.state.isFallback).toBe(true);
  });

  it("downloadHtml crea el documento HTML y dispara la descarga .html", async () => {
    const createObjectURL = vi.fn(() => "blob:html");
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, report: "# Título\n\nPárrafo", isFallback: false }),
    });
    const { result } = renderHook(() => useAiReport("p1"));
    await act(async () => {
      await result.current.generate();
    });

    act(() => {
      result.current.downloadHtml();
    });
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("downloadMarkdown sin texto no dispara descarga", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { result } = renderHook(() => useAiReport("p1"));
    act(() => {
      result.current.downloadMarkdown();
    });
    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("downloadMarkdown crea un blob y dispara la descarga .md", async () => {
    const createObjectURL = vi.fn(() => "blob:url");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, report: "# Título", isFallback: false }),
    });
    const { result } = renderHook(() => useAiReport("p1"));
    await act(async () => {
      await result.current.generate();
    });

    act(() => {
      result.current.downloadMarkdown();
    });
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });
});
