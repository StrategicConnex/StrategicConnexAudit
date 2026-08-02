import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { escapeHtml } from "./report-utils";
import { AiCopilot } from "./AiCopilot";

// ═══════════════════════════════════════════════════════════════════════════
// VULN-001 (REQ-101) — Regression test: la salida del modelo de IA nunca se
// renderiza como HTML crudo. Antes del fix, `dangerouslySetInnerHTML` inyectaba
// msg.content directo (XSS vía prompt injection). El fix aplica `escapeHtml()`
// ANTES del replace de markdown.
// ═══════════════════════════════════════════════════════════════════════════

/** Reproduce EXACTAMENTE el pipeline de render usado en AiCopilot.tsx:152. */
function renderSafe(content: string): string {
  return escapeHtml(content).replace(/\n/g, "<br/>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom no implementa scrollIntoView — el useEffect del widget lo llama al
// montar (scrollToBottom). Se stubbea para evitar el TypeError en los tests.
beforeEach(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ||
    (() => {}) as typeof Element.prototype.scrollIntoView;
});

// ─── 1. Unit: el pipeline de escape neutraliza payloads XSS ───────────────

describe("AiCopilot — sanitización de salida (VULN-001)", () => {
  it("escapeHtml escapa tags HTML y atributos onerror", () => {
    const payload = '<img src=x onerror=alert(document.cookie)>';
    expect(escapeHtml(payload)).toContain("&lt;img");
    expect(escapeHtml(payload)).toContain("&gt;");
    expect(escapeHtml(payload)).not.toContain("<img");
  });

  it("el pipeline completo NO produce tags HTML a partir del contenido del modelo", () => {
    const payloads = [
      '<img src=x onerror=alert(1)>',
      '<script>alert(1)</script>',
      '<svg onload=alert(1)>',
      '<a href="javascript:alert(1)">click</a>',
      '"><script>alert(1)</script>',
    ];
    for (const p of payloads) {
      const out = renderSafe(p);
      expect(out).not.toContain("<script");
      expect(out).not.toContain("<img");
      expect(out).not.toContain("<svg");
      expect(out).not.toContain("<a");
      // El esquema javascript: puede aparecer como TEXTO escapado (inofensivo),
      // pero NUNCA como atributo ejecutable sin comillas escapadas.
      expect(out).not.toContain("href=\"javascript:");
      expect(out).toContain("&lt;");
    }
  });

  it("el markdown **bold** sigue funcionando después del escape (sin regresión)", () => {
    const out = renderSafe("Riesgo **alto** <b>legítimo</b>");
    expect(out).toContain("<strong>alto</strong>");
    // El <b> del contenido debe quedar escapado, no convertido en tag
    expect(out).not.toContain("<b>legítimo</b>");
    expect(out).toContain("&lt;b&gt;legítimo&lt;/b&gt;");
  });

  it("los saltos de línea siguen generando <br/>", () => {
    const out = renderSafe("línea 1\nlínea 2");
    expect(out).toContain("<br/>");
  });
});

// ─── 2. Integration: el componente renderiza payloads como texto plano ─────

describe("AiCopilot — render del componente (integration, fetch mockeado)", () => {
  it("una respuesta maliciosa del modelo se muestra como texto, no como HTML ejecutable", async () => {
    // Mock del POST /api/ai/copilot devolviendo un payload XSS
    const maliciousReply = '<img src=x onerror=alert(document.cookie)>';
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, message: maliciousReply }),
    }) as Response));

    const { container } = render(<AiCopilot contextData={{}} />);

    // Abrir el widget (estado inicial cerrado → botón flotante)
    fireEvent.click(screen.getByRole("button", { name: /Strategic Copilot/i }));

    // Escribir un prompt y enviarlo (Enter en el textarea)
    const textarea = screen.getByPlaceholderText(/Pregúntale al Copilot/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "resume los hallazgos" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // Esperar a que llegue la respuesta del modelo
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    // ASSERT NÚCLEO (VULN-001): ningún tag img/script ejecutable en el DOM
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();

    // El payload se muestra como texto plano (las entidades se decodifican
    // en el textContent, pero NUNCA como elemento HTML)
    const rendered = screen.getByText("<img src=x onerror=alert(document.cookie)>");
    expect(rendered).toBeTruthy();
    // Y la versión escapada existe en el innerHTML del mensaje
    expect(container.innerHTML).toContain("&lt;img");
  });

  it("el markdown del modelo se convierte a <strong> sin abrir XSS", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, message: "Prioridad **alta** y <script>alert(1)</script>" }),
    }) as Response));

    const { container } = render(<AiCopilot contextData={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /Strategic Copilot/i }));
    const textarea = screen.getByPlaceholderText(/Pregúntale al Copilot/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "¿qué priorizo?" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(container.querySelector("strong")).not.toBeNull();
    });

    expect(container.querySelector("strong")?.textContent).toBe("alta");
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).toContain("&lt;script&gt;");
  });
});
