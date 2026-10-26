import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AiCopilot } from "./AiCopilot";

vi.mock("next-intl", () => {
  const dict: Record<string, string> = {
    title: "Strategic Copilot",
    openAria: "Abrir Strategic Copilot",
    dialogAria: "Strategic Copilot",
    logAria: "Conversación con el copilot",
    placeholderCopilot: "Pregúntale al Copilot...",
    placeholderAnalyst: "Comandos forenses o consultas de análisis...",
    retry: "Reintentar",
    errorUnavailable: "No se pudo obtener respuesta: {detail}",
    connError: "Error de conexión",
    httpError: "Error del asistente (HTTP {status})",
    greetingCopilot: "Hola. Soy Strategic Copilot. ¿En qué te puedo ayudar hoy?",
    greetingAnalyst: "Analyst Mode activo.",
    stop: "Detener generación",
  };
  // Estable entre renders, igual que el useTranslations real de next-intl
  // (memoriza por locale). Devolver una función NUEVA por render haría que
  // los efectos con `t` en dependencias (restauración del historial) entren
  // en bucle infinito de setMessages.
  const translator = (key: string, values?: Record<string, unknown>) => {
    const template = dict[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
      String(values?.[name] ?? ""),
    );
  };
  return {
    useTranslations: () => translator,
  };
});

// MermaidBlock importa `mermaid` (~2 MB) de forma dinámica; en jsdom no hace
// falta renderizar SVG real: comprobamos que el bloque se delega con el código.
vi.mock("./MermaidBlock", () => ({
  MermaidBlock: ({ code }: { code: string }) => <div data-testid="mermaid-block">{code}</div>,
}));

// ═══════════════════════════════════════════════════════════════════════════
// VULN-001 (REQ-101) — la salida del modelo nunca se inyecta como HTML.
// El renderer pasó de `dangerouslySetInnerHTML` + escape manual a
// react-markdown SIN rehype-raw: interpreta Markdown (tablas, títulos) y
// descarta el HTML crudo. Estos tests fijan ambas garantías.
// ═══════════════════════════════════════════════════════════════════════════

/** jsdom no implementa scrollIntoView (lo llama el useEffect al montar). */
beforeEach(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ||
    (() => {}) as typeof Element.prototype.scrollIntoView;
  // El historial persiste en localStorage (Sprint 1): sin este clear, la
  // conversación de un test se restauraría en el siguiente y los asserts
  // de saludo / quick-questions dejarían de ser deterministas.
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockReply(message: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, message }),
    }) as Response),
  );
}

async function openAndSend(text = "resume los hallazgos") {
  const utils = render(<AiCopilot contextData={{}} />);
  fireEvent.click(screen.getByRole("button", { name: /Strategic Copilot/i }));
  const textarea = screen.getByPlaceholderText(
    /Pregúntale al Copilot/i,
  ) as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: "Enter" });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  return utils;
}

describe("AiCopilot — sanitización de salida (VULN-001)", () => {
  it("un payload XSS del modelo no crea elementos ejecutables", async () => {
    mockReply('<img src=x onerror=alert(document.cookie)><script>alert(1)</script>');
    const { container } = await openAndSend();

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("svg[onload]")).toBeNull();
    // El HTML crudo se muestra escapado como texto (nunca como elemento).
    expect(container.textContent).toContain("<img src=x onerror=alert(document.cookie)>");
  });

  it("el mensaje del usuario se pinta como texto literal, no como HTML", async () => {
    mockReply("ok");
    const payload = '<img src=x onerror=alert(1)>';
    const { container } = await openAndSend(payload);

    expect(screen.getByText(payload)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("AiCopilot — Markdown real (tarea 0.5)", () => {
  it("renderiza títulos, tablas GFM y negritas sin mostrar sintaxis cruda", async () => {
    mockReply(
      [
        "#### Plan de acción",
        "",
        "| Día | Tarea |",
        "| --- | --- |",
        "| 1 | Escaneo de puertos |",
        "",
        "Prioridad **alta**.",
      ].join("\n"),
    );

    const { container } = await openAndSend();

    await waitFor(() => expect(container.querySelector("table")).not.toBeNull());

    expect(container.querySelector("h4")?.textContent).toBe("Plan de acción");
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelector("th")?.textContent).toBe("Día");
    expect(container.querySelector("td")?.textContent).toBe("1");
    expect(container.querySelector("strong")?.textContent).toBe("alta");

    // La sintaxis Markdown ya no se ve como texto plano.
    expect(container.textContent).not.toContain("####");
    expect(container.textContent).not.toContain("| --- |");
    expect(container.textContent).not.toContain("**alta**");
  });

  it("los enlaces se abren en pestaña nueva con rel=noopener", async () => {
    mockReply("Consulta [la guía](https://example.com/guia) para más detalle.");
    const { container } = await openAndSend();

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/guia");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(link?.getAttribute("rel")).toContain("noreferrer");
  });

  it("delega los bloques ```mermaid``` a MermaidBlock", async () => {
    mockReply("```mermaid\ngraph TD; A-->B\n```");
    await openAndSend();

    await waitFor(() => expect(screen.getByTestId("mermaid-block")).toBeTruthy());
    expect(screen.getByTestId("mermaid-block").textContent).toContain("graph TD");
  });
});

/**
 * Tarea 0.6: un fallo del pool (503) o de cuota (429) NUNCA debe pintarse
 * como una respuesta del asistente. Debe ser un estado de error visible,
 * distinguible y reintentable.
 */
function mockSequence(
  ...replies: Array<{ status?: number; body: unknown }>
) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const next = replies.shift();
    if (!next) throw new Error("sin respuestas mockeadas");
    const status = next.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => next.body,
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("AiCopilot — errores con semántica real (tarea 0.6)", () => {
  it("503 → error visible y Reintentar reenvía sin duplicar el mensaje", async () => {
    const fetchMock = mockSequence(
      { status: 503, body: { success: false, error: "pool caído" } },
      { status: 200, body: { success: true, message: "Respuesta recuperada" } },
    );

    const { container } = await openAndSend("consulta importante");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Reintentar/i })).toBeTruthy(),
    );
    expect(container.textContent).toContain("pool caído");
    expect(container.textContent).not.toContain("Respuesta recuperada");

    fireEvent.click(screen.getByRole("button", { name: /Reintentar/i }));

    await waitFor(() => expect(screen.getByText("Respuesta recuperada")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const secondBody = JSON.parse(String(init.body)) as {
      messages: { role: string; content: string }[];
    };
    // Saludo + mensaje del usuario + respuesta; el error intermedio se retiró
    // y el mensaje del usuario NO se duplica.
    expect(
      secondBody.messages.filter((m) => m.content === "consulta importante"),
    ).toHaveLength(1);
    expect(container.textContent).not.toContain("pool caído");
  });

  it("429 de cuota → motivo visible y Reintentar disponible", async () => {
    mockSequence({
      status: 429,
      body: { success: false, error: "Cuota diaria agotada" },
    });

    await openAndSend();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Reintentar/i })).toBeTruthy(),
    );
    expect(screen.getByText(/Cuota diaria agotada/)).toBeTruthy();
  });
});

describe("AiCopilot — accesibilidad del diálogo (tarea 0.8)", () => {
  it("expone la conversación como log y Escape cierra devolviendo el foco", async () => {
    mockReply("ok");
    render(<AiCopilot contextData={{}} />);

    const trigger = screen.getByRole("button", { name: /Strategic Copilot/i });
    fireEvent.click(trigger);

    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(log.getAttribute("aria-relevant")).toBe("additions");
    expect(log.getAttribute("aria-label")).toBe("Conversación con el copilot");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/Pregúntale al Copilot/i)).toBeNull(),
    );
    // El trigger se desmonta al abrir y se remonta al cerrar: el foco vuelve
    // al nodo nuevo (mismo nombre accesible), no al nodo desconectado.
    const reopenedTrigger = screen.getByRole("button", { name: /Strategic Copilot/i });
    expect(document.activeElement).toBe(reopenedTrigger);
    expect(document.activeElement?.getAttribute("aria-haspopup")).toBe("dialog");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Task 1.2 — Botón Stop / AbortController (evidencia 2 del cierre Sprint 1)

   El fetch se mockea RESPETANDO init.signal (como el fetch real): al abortar,
   el reader pendiente del SSE se errora y consumeChatStream propaga el
   AbortError. El componente debe distinguirlo de un fallo del servicio:
   conserva el texto parcial y NO pinta estado de error reintentable.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch SSE en abierto: entrega `firstChunk` (opcional) y se queda esperando
 * hasta que el AbortSignal del caller se dispare → error del stream.
 */
function mockOpenStream(firstChunk?: string) {
  const encoder = new TextEncoder();
  const fn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal ?? null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (firstChunk) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: firstChunk })}\n\n`),
          );
        }
        signal?.addEventListener("abort", () => {
          try {
            controller.error(new DOMException("The operation was aborted.", "AbortError"));
          } catch {
            // El stream ya estaba cerrado: nada que propagar.
          }
        });
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("AiCopilot — Stop con AbortController (Task 1.2)", () => {
  it("el envío viaja con AbortSignal y Stop conserva el parcial SIN error", async () => {
    const fetchMock = mockOpenStream("Texto parcial llegado ");
    render(<AiCopilot contextData={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /Strategic Copilot/i }));

    const textarea = screen.getByPlaceholderText(
      /Pregúntale al Copilot/i,
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "pregunta larga" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeTruthy(); // sin esto Stop no cancelaría nada

    // Llega el primer chunk y mientras el stream sigue abierto aparece Stop.
    await waitFor(() => expect(screen.getByText(/Texto parcial llegado/)).toBeTruthy());
    const stopButton = await screen.findByRole("button", { name: /Detener generación/i });
    fireEvent.click(stopButton);

    // El stream se cerró: Stop desaparece, el envío vuelve a estar disponible.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Detener generación/i })).toBeNull(),
    );
    // Texto parcial conservado y NINGÚN estado de error reintentable.
    expect(screen.getByText(/Texto parcial llegado/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reintentar/i })).toBeNull();
    expect(screen.queryByText(/No se pudo obtener respuesta/)).toBeNull();
    // Tampoco queda "generando": el finally limpió isLoading.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Stop antes del primer chunk no deja error ni respuesta ficticia", async () => {
    mockOpenStream(); // nunca entrega texto
    render(<AiCopilot contextData={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /Strategic Copilot/i }));

    const textarea = screen.getByPlaceholderText(
      /Pregúntale al Copilot/i,
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "sin respuesta" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    const stopButton = await screen.findByRole("button", { name: /Detener generación/i });
    fireEvent.click(stopButton);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Detener generación/i })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: /Reintentar/i })).toBeNull();
    expect(screen.queryByText(/No se pudo obtener respuesta/)).toBeNull();
    // El placeholder vacío se retiró del estado: sin indicador de "generando"
    // ni burbuja de error; el mensaje del usuario sigue en la conversación.
    expect(screen.queryByRole("status")).toBeNull();
    const log = screen.getByRole("log");
    expect(log.textContent).toContain("sin respuesta");
  });
});
