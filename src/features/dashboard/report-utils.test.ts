import { describe, it, expect } from "vitest";
import {
  parseMarkdownReport,
  extractMermaidBlocks,
  tableRowsToChartData,
} from "./report-utils";

// ─── Sample realista del reporte IA (formato que exige el prompt del route) ──
// El prompt de POST /api/ai/report instruye: comenzar con "Desde Strategic
// Connex", estructura Resumen/Análisis (tabla)/Diagnóstico/Plan de Acción,
// y EXACTAMENTE UN bloque mermaid flowchart al final del Plan de Acción.
const REAL_AI_REPORT = `Desde Strategic Connex (strategicconnex.com.ar)

# 📊 Reporte Estratégico Mensual SEO — E2E AI Report Project
*Periodo de Análisis: Julio 2026*
*Dominio: https://e2e-report.example.com*

---

## 🏢 Resumen Ejecutivo

Durante este periodo el dominio consolidó su visibilidad orgánica con una tendencia positiva en clicks e impresiones. La salud técnica se mantiene estable y el plan de acción prioriza optimización de CTR.

---

## 📈 Análisis de Rendimiento y Visibilidad

| Métrica SEO / Analítica | Valor Registrado | Estado / Tendencia |
| :--- | :--- | :--- |
| **Clicks Orgánicos** | 8,420 clicks | 🟢 Estable (+4.6% vs periodo anterior) |
| **Impresiones Totales** | 124.8K búsquedas | 🟢 Incremento en visibilidad |
| **CTR Promedio** | 6,74% | 🟡 Estable (Meta: >3.5%) |
| **Posición SERP Promedio** | #4.2 global | 🟢 Top 5 |
| **Usuarios Activos (GA4)** | 3,150 únicos | 🟢 Tráfico recurrente |
| **Conversiones** | 84 completadas | 🟢 Crecimiento |

*Análisis:* La posición promedio en primera página permite capturar volumen de búsqueda transaccional.

---

## 🛠️ Diagnóstico de Salud Técnica y Velocidad

Se verificaron **142 URLs**, asignando una puntuación de salud de:

# 🏆 85 / 100
*Clasificación: Rendimiento Premium*

### ⚡ Core Web Vitals:
*   **Largest Contentful Paint (LCP):** 1.8 segundos (🟢 Rápido)
*   **Interaction to Next Paint (INP):** 210ms (🟡 Mejorable)
*   **Cumulative Layout Shift (CLS):** 0.03 (🟢 Estable)

---

## 🎯 Plan de Acción Priorizado para el Próximo Mes

1.  **Optimización de Metaetiquetas (Prioridad Alta):**
    *   Rediseñar titles y meta descriptions de las 10 URLs con menor CTR.
2.  **Ajuste de Carga de Scripts (Prioridad Media):**
    *   Diferir scripts de terceros para reducir INP móvil.
3.  **Enriquecimiento Schema JSON-LD (Prioridad Media):**
    *   Implementar Product/FAQ en landings de alta conversión.

\`\`\`mermaid
flowchart TD
    A[Inicio] --> B{Optimización Metaetiquetas - Alta}
    B -->|Completada| C[Carga de Scripts - Media]
    C --> D[Schema JSON-LD - Media]
    D --> E[Reporte Final]
\`\`\`

---
*Reporte generado automáticamente por StrategicAudit Pro.*`;

// ─── parseMarkdownReport ───────────────────────────────────────────

describe("parseMarkdownReport", () => {
  it("parsea un reporte IA completo con tabla, salud y plan", () => {
    const parsed = parseMarkdownReport(REAL_AI_REPORT);
    expect(parsed.title).toContain("E2E AI Report Project");
    expect(parsed.summary).toContain("visibilidad orgánica");
    expect(parsed.tableRows.length).toBeGreaterThanOrEqual(4);
    expect(parsed.tableRows[0]).toMatchObject({ metric: "Clicks Orgánicos", value: "8,420 clicks" });
    expect(parsed.healthScore).toBe(85);
    expect(parsed.healthClassification).toContain("Rendimiento Premium");
    expect(parsed.planItems.length).toBe(3);
    expect(parsed.planItems[0].priority).toBe("Alta");
    expect(parsed.lcp).toContain("1.8");
  });

  it("convierte las filas del reporte real en datos de chart", () => {
    const parsed = parseMarkdownReport(REAL_AI_REPORT);
    const chart = tableRowsToChartData(parsed.tableRows);
    expect(chart.length).toBeGreaterThanOrEqual(4);
    const clicks = chart.find((d) => d.name === "Clicks Orgánicos");
    expect(clicks?.value).toBe(8420);
    const ctr = chart.find((d) => d.name === "CTR Promedio");
    expect(ctr?.value).toBe(6.74);
  });
});

// ─── extractMermaidBlocks ──────────────────────────────────────────

describe("extractMermaidBlocks (reporte real)", () => {
  it("extrae el diagrama mermaid del Plan de Acción", () => {
    const blocks = extractMermaidBlocks(REAL_AI_REPORT);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toContain("flowchart TD");
    expect(blocks[0].code).toContain("A[Inicio]");
  });

  it("el reporte resiliente (sin IA) SIEMPRE incluye mermaid y parsea su sección de salud", () => {
    // El template resiliente del route incluye un diagrama mermaid fijo, así el
    // informe con gráficos llega incluso si los modelos :free tardan demasiado.
    const resilient = `Desde Strategic Connex (strategicconnex.com.ar)
# 📊 Reporte Estratégico Mensual SEO — Cliente
| **Clicks Orgánicos** | 8,420 clicks | 🟢 |

## 🛠️ Diagnóstico de Salud Técnica y Velocidad

# 🏆 72 / 100
*Clasificación: Requiere Optimización*

## 🔄 Diagrama de Priorización (Mermaid)

\`\`\`mermaid
flowchart TD
    A[Inicio] --> B{Tarea Alta}
    B --> C[Tarea Media]
\`\`\``;
    const parsed = parseMarkdownReport(resilient);
    expect(parsed.healthScore).toBe(72);
    expect(parsed.healthClassification).toContain("Requiere Optimización");
    // El reporte resiliente garantiza el diagrama mermaid en producción
    const blocks = extractMermaidBlocks(resilient);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toContain("flowchart TD");
  });
});

describe("extractMermaidBlocks", () => {
  it("extrae bloques mermaid del markdown", () => {
    const md = [
      "# Reporte",
      "",
      "```mermaid",
      "flowchart TD",
      "    A[Inicio] --> B{Tarea 1}",
      "```",
      "",
      "Fin.",
    ].join("\n");
    const blocks = extractMermaidBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toContain("flowchart TD");
    expect(blocks[0].code).toContain("A[Inicio]");
  });

  it("extrae multiples diagramas en orden", () => {
    const md = [
      "```mermaid",
      "graph LR",
      "    A --> B",
      "```",
      "texto",
      "```mermaid",
      "pie title Distribucion",
      '    "A" : 60',
      '    "B" : 40',
      "```",
    ].join("\n");
    const blocks = extractMermaidBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].code).toContain("graph LR");
    expect(blocks[1].code).toContain("pie title");
  });

  it("ignora bloques de codigo que no son mermaid", () => {
    const md = [
      "```js",
      "const x = 1;",
      "```",
      "```mermaid",
      "sequenceDiagram",
      "    A->>B: ping",
      "```",
    ].join("\n");
    const blocks = extractMermaidBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toContain("sequenceDiagram");
  });

  it("devuelve [] si no hay diagramas", () => {
    expect(extractMermaidBlocks("solo texto sin fences")).toEqual([]);
  });
});

describe("tableRowsToChartData", () => {
  it("convierte filas con miles (es) y decimales", () => {
    const rows = [
      { metric: "Clicks", value: "8,420 clicks", status: "" },
      { metric: "Impresiones", value: "124.8K busquedas", status: "" },
      { metric: "CTR", value: "6,74%", status: "" },
      { metric: "Posicion", value: "#4.2", status: "" },
    ];
    const data = tableRowsToChartData(rows);
    expect(data).toEqual([
      { name: "Clicks", value: 8420 },
      { name: "Impresiones", value: 124800 },
      { name: "CTR", value: 6.74 },
      { name: "Posicion", value: 4.2 },
    ]);
  });

  it("soporta punto decimal US y coma de miles", () => {
    const data = tableRowsToChartData([
      { metric: "CTR US", value: "6.74%", status: "" },
      { metric: "Miles", value: "12,345,678", status: "" },
    ]);
    expect(data[0].value).toBe(6.74);
    expect(data[1].value).toBe(12345678);
  });

  it("filtra valores no numericos", () => {
    const data = tableRowsToChartData([
      { metric: "Sin datos", value: "N/A", status: "" },
      { metric: "OK", value: "42", status: "" },
    ]);
    expect(data).toEqual([{ name: "OK", value: 42 }]);
  });
});
