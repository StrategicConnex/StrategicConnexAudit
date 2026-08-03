import { describe, it, expect } from "vitest";
import { generateHtmlReportDocument, ParsedReport, escapeHtml } from "./report-utils";

function maliciousReport(): ParsedReport {
  return {
    title: `<img src=x onerror=alert(1)> Reporte`,
    summary: `<script>alert(2)</script> resumen del mes`,
    performanceIntro: `<svg onload=alert(3)>`,
    tableRows: [
      { metric: `Clicks</td><script>alert(4)</script>`, value: `8,420" onmouseover="alert(5)`, status: `<b onclick=alert(6)>Estable</b>` },
    ],
    healthScore: 85,
    healthClassification: `<img src=x onerror=alert(7)>`,
    lcp: `<script>alert(8)</script>`,
    inp: `210ms" autofocus onfocus="alert(9)`,
    cls: `0.03`,
    planItems: [
      { title: `Optimizar" onerror="alert(10)`, desc: `<iframe src=javascript:alert(11)>`, priority: "Alta" },
    ],
  };
}

describe("generateHtmlReportDocument (XSS defense en salida IA)", () => {
  it("escapa TODOS los campos del reporte antes de emitir HTML", () => {
    const html = generateHtmlReportDocument(maliciousReport());

    // Sin tags crudos del payload: los `<`/`>` de todo campo están escapados.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<iframe");

    // Propiedad real: el documento PARSEADO no puede contener elementos
    // ejecutables ni atributos de evento (los payloads quedan como texto).
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("script, img, svg, iframe, [onerror], [onload], [onclick], [onmouseover], [onfocus]")).toBeNull();
    // Los payloads siguen visibles como texto escapado (no se pierde info).
    expect(doc.body.textContent).toContain("onerror");
    expect(doc.body.textContent).toContain("javascript:");
  });

  it("mantiene el markdown renderizable como texto escapado", () => {
    const html = generateHtmlReportDocument(maliciousReport());
    // El payload sigue visible como texto escapado (no se pierde información).
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("genera un documento HTML válido de reporte", () => {
    const html = generateHtmlReportDocument(maliciousReport());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Reporte Estratégico");
    expect(html).toContain("Métrica SEO / Analítica");
    expect(html).toContain("Plan de Acción");
  });
});

describe("escapeHtml (report-utils)", () => {
  it("escapa los 5 caracteres especiales", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#039;");
  });
});
