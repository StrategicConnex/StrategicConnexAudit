/**
 * Tests del cliente de streaming del chat (Sprint 1):
 *   • consumeChatStream / isEventStreamResponse — parser SSE tolerante.
 *   • useChatHistory — persistencia localStorage con TTL, tope y filtros.
 *   • StreamingChatMessage — Copiar / Regenerar / Reintentar + caret.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  consumeChatStream,
  isEventStreamResponse,
} from "./chat-stream";
import {
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
} from "./useChatHistory";

// ─── Helpers SSE ────────────────────────────────────────────────────────────

function sseEvent(type: string, extra: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ type, ...extra })}`;
}

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
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

// ─── consumeChatStream ──────────────────────────────────────────────────────

describe("consumeChatStream", () => {
  it("reparte los chunks en orden y resuelve con done + meta", async () => {
    const chunks: string[] = [];
    let doneMeta: unknown = null;
    const response = sseResponse([
      sseEvent("chunk", { text: "Hola " }),
      sseEvent("chunk", { text: "mundo" }),
      sseEvent("done", { modelUsed: "m1", fromCache: false }),
    ]);

    const outcome = await consumeChatStream(response, {
      onChunk: (t) => chunks.push(t),
      onDone: (meta) => {
        doneMeta = meta;
      },
    });

    expect(chunks).toEqual(["Hola ", "mundo"]);
    expect(outcome.ok).toBe(true);
    expect(outcome.completed).toBe(true);
    expect(outcome.meta).toEqual({ modelUsed: "m1", fromCache: false });
    expect(doneMeta).toEqual({ modelUsed: "m1", fromCache: false });
  });

  it("ignora líneas basura, eventos desconocidos y JSON roto sin lanzar", async () => {
    const payload = [
      ": comentario sse",
      "event: ping",
      "data: {json roto",
      sseEvent("chunk", { text: "ok" }),
      "data: {\"type\":\"weird\"}",
      sseEvent("done"),
    ].join("\n\n");

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(payload + "\n\n"));
        c.close();
      },
    });
    const response = new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });

    const chunks: string[] = [];
    const outcome = await consumeChatStream(response, { onChunk: (t) => chunks.push(t) });

    expect(chunks).toEqual(["ok"]);
    expect(outcome.ok).toBe(true);
  });

  it("evento error → ok:false con el mensaje (el texto previo ya se emitió)", async () => {
    const chunks: string[] = [];
    const response = sseResponse([
      sseEvent("chunk", { text: "parcial" }),
      sseEvent("error", { message: "Stream interrumpido por m1" }),
    ]);

    const outcome = await consumeChatStream(response, { onChunk: (t) => chunks.push(t) });

    expect(chunks).toEqual(["parcial"]);
    expect(outcome.ok).toBe(false);
    expect(outcome.completed).toBe(true);
    expect(outcome.error).toContain("Stream interrumpido");
  });

  it("sin done explícito (stream cerrado a medias) → ok:false", async () => {
    const response = sseResponse([sseEvent("chunk", { text: "a" })]);
    const outcome = await consumeChatStream(response, { onChunk: () => {} });
    expect(outcome.ok).toBe(false);
    expect(outcome.completed).toBe(false);
  });

  it("body ausente → outcome de error, nunca una excepción", async () => {
    const response = new Response(null, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
    const outcome = await consumeChatStream(response, { onChunk: () => {} });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeTruthy();
  });
});

describe("isEventStreamResponse", () => {
  it("detecta text/event-stream y descarta JSON", () => {
    expect(
      isEventStreamResponse(
        new Response(null, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } }),
      ),
    ).toBe(true);
    expect(
      isEventStreamResponse(
        new Response("{}", { headers: { "Content-Type": "application/json" } }),
      ),
    ).toBe(false);
    // Respuestas mockeadas sin headers (tests legados) → camino JSON.
    expect(isEventStreamResponse({} as unknown as Response)).toBe(false);
  });
});

// ─── useChatHistory (persistencia) ──────────────────────────────────────────

describe("chat history (localStorage)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("guarda y recupera la conversación completa", () => {
    saveChatHistory("copilot", [
      { role: "user", content: "¿qué priorizo?" },
      { role: "assistant", content: "Los críticos." },
    ]);

    expect(loadChatHistory("copilot")).toEqual([
      { role: "user", content: "¿qué priorizo?" },
      { role: "assistant", content: "Los críticos." },
    ]);
    // Claves por modo aisladas: analyst no ve el historial de copilot.
    expect(loadChatHistory("analyst")).toEqual([]);
  });

  it("filtra mensajes de error y respuestas a medio generar", () => {
    saveChatHistory("copilot", [
      { role: "user", content: "pregunta" },
      { role: "assistant", content: "", isStreaming: true },
      { role: "assistant", content: "No se pudo obtener respuesta", isError: true },
      { role: "assistant", content: "respuesta buena" },
    ]);

    expect(loadChatHistory("copilot")).toEqual([
      { role: "user", content: "pregunta" },
      { role: "assistant", content: "respuesta buena" },
    ]);
  });

  it("solo el saludo (sin mensajes de usuario) → no se persiste nada", () => {
    saveChatHistory("copilot", [{ role: "assistant", content: "Hola. Soy Strategic Copilot." }]);
    expect(window.localStorage.getItem("scaudit:chat:copilot")).toBeNull();
    expect(loadChatHistory("copilot")).toEqual([]);
  });

  it("recorta a los últimos 100 mensajes", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg-${i}`,
    }));
    saveChatHistory("copilot", many);

    const loaded = loadChatHistory("copilot");
    expect(loaded).toHaveLength(100);
    expect(loaded.at(-1)?.content).toBe("msg-149"); // se conserva lo más reciente
  });

  it("TTL de 7 días: el historial vencido se ignora Y se borra", () => {
    window.localStorage.setItem(
      "scaudit:chat:copilot",
      JSON.stringify({
        v: 1,
        savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        messages: [{ role: "user", content: "viejo" }],
      }),
    );

    expect(loadChatHistory("copilot")).toEqual([]);
    expect(window.localStorage.getItem("scaudit:chat:copilot")).toBeNull();
  });

  it("payload corrupto o de versión desconocida → [] sin lanzar", () => {
    window.localStorage.setItem("scaudit:chat:copilot", "no-es-json{");
    expect(loadChatHistory("copilot")).toEqual([]);

    window.localStorage.setItem(
      "scaudit:chat:copilot",
      JSON.stringify({ v: 99, savedAt: Date.now(), messages: [{ role: "user", content: "x" }] }),
    );
    expect(loadChatHistory("copilot")).toEqual([]);
  });

  it("clear borra solo su clave", () => {
    saveChatHistory("copilot", [{ role: "user", content: "hola" }]);
    saveChatHistory("analyst", [{ role: "user", content: "triage" }]);
    clearChatHistory("copilot");

    expect(loadChatHistory("copilot")).toEqual([]);
    expect(loadChatHistory("analyst")).toEqual([{ role: "user", content: "triage" }]);
  });
});

// ─── StreamingChatMessage (acciones) ────────────────────────────────────────

vi.mock("next-intl", () => {
  const dict: Record<string, string> = {
    copyMessage: "Copiar respuesta",
    copied: "¡Copiado!",
    regenerate: "Volver a Generar",
    retry: "Reintentar",
  };
  return {
    useTranslations: () => (key: string) => dict[key] ?? key,
  };
});

// MermaidBlock importa `mermaid` (~2 MB) dinámicamente: irrelevante aquí.
vi.mock("../MermaidBlock", () => ({
  MermaidBlock: ({ code }: { code: string }) => <div data-testid="mermaid-block">{code}</div>,
}));

import { StreamingChatMessage } from "./StreamingChatMessage";

describe("StreamingChatMessage", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("Copiar lleva el contenido exacto al portapapeles y muestra feedback", async () => {
    render(
      <StreamingChatMessage
        message={{ role: "assistant", content: "### Plan\n\n1. Escaneo" }}
        mode="copilot"
        isLast={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copiar respuesta" }));

    expect(writeText).toHaveBeenCalledWith("### Plan\n\n1. Escaneo");
    // Feedback inmediato: el botón pasa a "¡Copiado!".
    expect(await screen.findByRole("button", { name: "¡Copiado!" })).toBeTruthy();
  });

  it("Regenerar (último mensaje) invoca el handler", () => {
    const onRegenerate = vi.fn();
    render(
      <StreamingChatMessage
        message={{ role: "assistant", content: "respuesta" }}
        mode="copilot"
        isLast={true}
        onRegenerate={onRegenerate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Volver a Generar" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("Regenerar NO aparece en mensajes intermedios ni en errores", () => {
    const onRegenerate = vi.fn();
    const { rerender } = render(
      <StreamingChatMessage
        message={{ role: "assistant", content: "vieja" }}
        mode="copilot"
        isLast={false}
        onRegenerate={onRegenerate}
      />,
    );
    expect(screen.queryByRole("button", { name: "Volver a Generar" })).toBeNull();

    rerender(
      <StreamingChatMessage
        message={{ role: "assistant", content: "fallo", isError: true }}
        mode="copilot"
        isLast={true}
        onRegenerate={onRegenerate}
      />,
    );
    expect(screen.queryByRole("button", { name: "Volver a Generar" })).toBeNull();
  });

  it("el último error expone Reintentar (y nada más)", () => {
    const onRetry = vi.fn();
    render(
      <StreamingChatMessage
        message={{ role: "assistant", content: "No se pudo obtener respuesta", isError: true }}
        mode="copilot"
        isLast={true}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Copiar respuesta" })).toBeNull();
  });

  it("durante el streaming hay caret y NO hay acciones", () => {
    render(
      <StreamingChatMessage
        message={{ role: "assistant", content: "partial", isStreaming: true }}
        mode="copilot"
        isLast={true}
        onRegenerate={vi.fn()}
      />,
    );

    expect(document.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copiar respuesta" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Volver a Generar" })).toBeNull();
  });

  it("los mensajes de usuario son texto plano, sin acciones", () => {
    render(
      <StreamingChatMessage
        message={{ role: "user", content: "<b>hola</b>" }}
        mode="copilot"
        isLast={true}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.getByText("<b>hola</b>")).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copiar respuesta" })).toBeNull();
  });
});
