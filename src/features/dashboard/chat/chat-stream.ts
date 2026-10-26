/**
 * chat-stream.ts — Consumidor cliente del SSE de /api/ai/copilot (stream: true).
 *
 * Protocolo (formato estándar `data: <json>\n\n`):
 *   {"type":"chunk","text":"…"}                    — delta de texto del modelo
 *   {"type":"done","modelUsed":"…","fromCache":false}
 *   {"type":"error","message":"…"}
 *
 * El parser es deliberadamente tolerante: líneas sin `data:`, JSON roto o un
 * corte de conexión no lanzan — se devuelven en el outcome para que la UI
 * pinte el texto parcial junto al error (Sprint 1, UX de fallo a mitad de
 * respuesta).
 */

export interface ChatStreamMeta {
  modelUsed?: string;
  fromCache?: boolean;
}

export interface ChatStreamHandlers {
  /** Se invoca con cada delta de texto, en orden. */
  onChunk: (text: string) => void;
  /** Solo cuando el stream terminó con un evento `done` explícito. */
  onDone?: (meta: ChatStreamMeta) => void;
}

export interface ChatStreamOutcome {
  /** true solo si el stream terminó con `done` y sin evento `error`. */
  ok: boolean;
  /** true si el servidor cerró el stream (aunque haya sido con error). */
  completed: boolean;
  error?: string;
  meta?: ChatStreamMeta;
}

/** ¿La respuesta es un stream SSE y no el JSON histórico? */
export function isEventStreamResponse(response: Response): boolean {
  const contentType = response.headers?.get?.("content-type") ?? "";
  return contentType.includes("text/event-stream");
}

/**
 * Lee el stream hasta el final invocando los handlers. Nunca lanza: cualquier
 * problema queda reflejado en el outcome devuelto.
 */
export async function consumeChatStream(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<ChatStreamOutcome> {
  const body = response.body;
  if (!body) {
    return { ok: false, completed: false, error: "empty stream body" };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  let error: string | undefined;
  let meta: ChatStreamMeta | undefined;

  const processLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;

    let event: {
      type?: string;
      text?: unknown;
      message?: unknown;
      modelUsed?: unknown;
      fromCache?: unknown;
    };
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }

    if (event.type === "chunk" && typeof event.text === "string") {
      handlers.onChunk(event.text);
    } else if (event.type === "done") {
      completed = true;
      meta = {
        ...(typeof event.modelUsed === "string" ? { modelUsed: event.modelUsed } : {}),
        ...(typeof event.fromCache === "boolean" ? { fromCache: event.fromCache } : {}),
      };
    } else if (event.type === "error") {
      error = typeof event.message === "string" ? event.message : "stream error";
      completed = true;
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        processLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    if (buffer.length > 0) processLine(buffer);
  } finally {
    reader.releaseLock();
  }

  const ok = completed && !error;
  if (ok && handlers.onDone) handlers.onDone(meta ?? {});
  return {
    ok,
    completed,
    ...(error ? { error } : {}),
    ...(meta ? { meta } : {}),
  };
}
