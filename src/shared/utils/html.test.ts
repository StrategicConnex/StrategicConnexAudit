import { describe, it, expect } from "vitest";
import { escapeHtml, syntaxHighlightJson } from "./html";

// ─── escapeHtml ──────────────────────────────────────────────────────────────

describe("escapeHtml (XSS defense)", () => {
  it("escapa los 5 caracteres HTML especiales", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#039;");
  });

  it("neutraliza un payload clasico <script>", () => {
    const out = escapeHtml(`<script>alert(1)</script>`);
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;");
  });

  it("neutraliza <img onerror> y <svg onload>", () => {
    const img = escapeHtml(`<img src=x onerror=alert(1)>`);
    // Ningún carácter de tag crudo sobrevive: no existe `<` ni `>` literal.
    expect(img).not.toMatch(/[<>]/);
    expect(img).toContain("&lt;img");
    expect(img).toContain("&gt;");

    const svg = escapeHtml(`<svg onload=alert(1)>`);
    expect(svg).not.toMatch(/[<>]/);
    expect(svg).toContain("&lt;svg");

    // Parseado como HTML, el payload queda como TEXTO, no como elemento ejecutable.
    const div = document.createElement("div");
    div.innerHTML = img;
    expect(div.querySelector("img, svg, script")).toBeNull();
    expect(div.textContent).toContain("onerror=");
  });

  it("rompe atributos: una comilla dentro de un atributo queda escapada", () => {
    // Payload que intenta cerrar el atributo href y abrir onerror.
    const payload = `javascript:" onerror="alert(1)`;
    const out = escapeHtml(payload);
    // Las comillas escapadas impiden formar un atributo ejecutable real.
    expect(out).not.toContain('onerror="');
    expect(out).not.toContain('href="');
  });
});

// ─── syntaxHighlightJson ─────────────────────────────────────────────────────

describe("syntaxHighlightJson (escape-then-highlight pipeline)", () => {
  it("no introduce XSS al highlightear JSON ya escapado", () => {
    // Flujo real del playground: escapeHtml(texto) ANTES de pasar al highlighter.
    const raw = `{"nombre":"<script>alert(1)</script>","ok":true,"n":42}`;
    const escaped = escapeHtml(raw);
    const highlighted = syntaxHighlightJson(escaped);

    // Los spans inyectados son los unicos HTML crudo permitido.
    expect(highlighted).toContain('<span class="text-primary">');
    // El payload sigue escapado - no puede reconstituirse como HTML ejecutable.
    expect(highlighted).not.toContain("<script");
    expect(highlighted).toContain("&lt;script&gt;");
  });

  it("neutraliza intento de escape del <span> (breakout del highlighter)", () => {
    // Un payload que intenta cerrar el span y abrir HTML propio.
    const raw = `{"x":"</span><img src=x onerror=alert(1)>"}`;
    const escaped = escapeHtml(raw);
    const highlighted = syntaxHighlightJson(escaped);

    // No existe la secuencia cruda que cerraría el span y abriría un img.
    expect(highlighted).not.toContain("</span><img");
    expect(highlighted).toContain("&lt;/span&gt;");

    // Parseado, el payload queda como texto (los spans del highlighter son
    // los únicos elementos reales), no como un <img> ejecutable.
    const div = document.createElement("div");
    div.innerHTML = highlighted;
    expect(div.querySelector("img, script, iframe")).toBeNull();
    expect(div.textContent).toContain("onerror=");
  });

  it("highlightea keys, strings, booleanos, null y numeros", () => {
    const escaped = escapeHtml(`{"a":"b", "flag":true, "nada":null, "n":1.5}`);
    const highlighted = syntaxHighlightJson(escaped);
    expect(highlighted).toContain('class="text-primary"');
    expect(highlighted).toContain('class="text-chartreuse"');
    expect(highlighted).toContain('class="text-amber-400"');
    expect(highlighted).toContain('class="text-muted-fg/50"');
    expect(highlighted).toContain('class="text-purple-400"');
  });
});
