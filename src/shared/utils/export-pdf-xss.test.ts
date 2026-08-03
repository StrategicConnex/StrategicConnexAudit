import { describe, it, expect, vi, beforeEach } from "vitest";

// El módulo pdf-utils importa html2canvas + jspdf (pesados); lo mockeamos para
// testear SOLO los builders puros de header (XSS defense) sin entorno de PDF.
vi.mock("./pdf-utils", () => ({
  exportElementToPdf: vi.fn(async () => true),
}));

import {
  buildAuditHeaderHtml,
  AgencyBranding,
} from "./exportPdf";
import {
  buildIntelligenceHeaderHtml,
  IntelligenceBranding,
} from "./exportIntelligencePdf";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── buildAuditHeaderHtml ────────────────────────────────────────────────────

describe("buildAuditHeaderHtml (XSS defense en branding)", () => {
  it("escapa branding.name y branding.logoUrl maliciosos", () => {
    const malicious: AgencyBranding = {
      name: `<img src=x onerror=alert(1)>`,
      color: `#0C1929" onmouseover="alert(2)`,
      logoUrl: `x" onerror="alert(3)`,
    };
    const html = buildAuditHeaderHtml(malicious, "2026-08-02");

    // El output parseado no puede contener atributos de evento reales: las
    // comillas escapadas (&quot;) impiden romper el atributo src/style.
    const div = document.createElement("div");
    div.innerHTML = html;
    expect(div.querySelector("[onerror], [onmouseover], [onload], [onclick]")).toBeNull();
    // Sin tags crudos del payload.
    expect(html).not.toMatch(/<img src=x/);
    // El contenido malicioso queda como texto escapado.
    expect(html).toContain("&lt;img");
    expect(html).toContain("&quot;");
  });

  it("escapa la fecha generada", () => {
    const html = buildAuditHeaderHtml(
      { name: "Agencia", color: "#0C1929", logoUrl: "" },
      `<script>alert(1)</script>`
    );
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("devuelve cadena vacia sin branding", () => {
    expect(buildAuditHeaderHtml(undefined, "2026-08-02")).toBe("");
  });
});

// ─── buildIntelligenceHeaderHtml ─────────────────────────────────────────────

describe("buildIntelligenceHeaderHtml (XSS defense en targetName y branding)", () => {
  it("escapa targetName (investigation.target) malicioso", () => {
    const html = buildIntelligenceHeaderHtml(
      undefined,
      `" onmouseover="alert(1)`,
      "2026-08-02 10:00"
    );
    const div = document.createElement("div");
    div.innerHTML = html;
    expect(div.querySelector("[onmouseover]")).toBeNull();
    expect(div.textContent).toContain("onmouseover");
    expect(html).toContain("&quot;");
  });

  it("escapa branding.name y logoUrl maliciosos", () => {
    const malicious: IntelligenceBranding = {
      name: `<script>alert(1)</script>`,
      color: "#10b981",
      logoUrl: `x" onerror="alert(2)`,
    };
    const html = buildIntelligenceHeaderHtml(malicious, "example.com", "2026-08-02");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");

    const div = document.createElement("div");
    div.innerHTML = html;
    expect(div.querySelector("[onerror], script")).toBeNull();
    // El payload vive en el atributo src (escapado), no en nodos de texto:
    // la palabra queda como texto inerte en el HTML crudo, no como atributo.
    expect(html).toContain("onerror");
  });

  it("incluye el nombre del objetivo visible como texto seguro", () => {
    const html = buildIntelligenceHeaderHtml(undefined, "example.com", "2026-08-02");
    expect(html).toContain("example.com");
    expect(html).toContain("OBJETIVO");
  });
});
