import { describe, it, expect } from "vitest";
import {
  extractMermaidBlocks,
  tableRowsToChartData,
} from "./report-utils";

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
