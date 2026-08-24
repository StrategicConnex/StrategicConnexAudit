import { describe, it, expect } from "vitest";
import { parseMarkdown, splitInlineMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("parsea títulos H1/H2/H3", () => {
    const md = "# Título 1\n## Título 2\n### Título 3\n";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual([
      { type: "h1", content: "Título 1" },
      { type: "h2", content: "Título 2" },
      { type: "h3", content: "Título 3" },
    ]);
  });

  it("agrupa ítems consecutivos en un solo bloque ul", () => {
    const md = "- uno\n- dos\n- tres\n";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual([
      { type: "ul", items: ["uno", "dos", "tres"] },
    ]);
  });

  it("soporta * como marcador de ítem ul", () => {
    const blocks = parseMarkdown("* a\n* b\n");
    expect(blocks[0]).toEqual({ type: "ul", items: ["a", "b"] });
  });

  it("agrupa ítems consecutivos en un solo bloque ol", () => {
    const md = "1. primero\n2. segundo\n";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual([
      { type: "ol", items: ["primero", "segundo"] },
    ]);
  });

  it("separa ul y ol cuando cambia el tipo de lista", () => {
    const md = "- a\n1. b\n- c\n";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual([
      { type: "ul", items: ["a"] },
      { type: "ol", items: ["b"] },
      { type: "ul", items: ["c"] },
    ]);
  });

  it("extrae bloques de código con su lenguaje", () => {
    const md = "```bash\ncurl -s https://example.com\n```\n";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual([
      { type: "code", content: "curl -s https://example.com", language: "bash" },
    ]);
  });

  it("usa 'code' como lenguaje por defecto cuando no se declara", () => {
    const blocks = parseMarkdown("```\nconst x = 1;\n```\n");
    expect(blocks[0]!.language).toBe("code");
    expect(blocks[0]!.content).toBe("const x = 1;");
  });

  it("conserva código multi-línea intacto", () => {
    const md = "```js\nline1\nline2\nline3\n```\n";
    const blocks = parseMarkdown(md);
    expect(blocks[0]!.content).toBe("line1\nline2\nline3");
  });

  it("agrupa líneas de párrafo consecutivas con quiebre", () => {
    const md = "primera línea\nsegunda línea\n";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual([
      { type: "p", content: "primera línea\nsegunda línea" },
    ]);
  });

  it("separa párrafos con línea vacía", () => {
    const md = "párrafo uno\n\npárrafo dos\n";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual([
      { type: "p", content: "párrafo uno" },
      { type: "p", content: "párrafo dos" },
    ]);
  });

  it("emite el bloque de código final si el fence nunca se cierra", () => {
    const md = "```js\nconst abierto = true;\n";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual([
      { type: "code", content: "const abierto = true;", language: "js" },
    ]);
  });

  it("mezcla tipos de bloque en el orden correcto", () => {
    const md = "# Header\n\n- item1\n- item2\n\n```sql\nSELECT 1;\n```\n\nFin.\n";
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(["h1", "ul", "code", "p"]);
    expect(blocks[1]).toEqual({ type: "ul", items: ["item1", "item2"] });
    expect(blocks[2]).toEqual({ type: "code", content: "SELECT 1;", language: "sql" });
  });

  it("devuelve [] para markdown vacío", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n")).toEqual([]);
  });
});

describe("splitInlineMarkdown", () => {
  it("extrae tokens de negrita", () => {
    const tokens = splitInlineMarkdown("Hola **mundo**");
    expect(tokens).toEqual([
      { type: "text", content: "Hola " },
      { type: "bold", content: "mundo" },
    ]);
  });

  it("extrae tokens de código inline", () => {
    const tokens = splitInlineMarkdown("usa `npx tsc` ya");
    expect(tokens).toEqual([
      { type: "text", content: "usa " },
      { type: "code", content: "npx tsc" },
      { type: "text", content: " ya" },
    ]);
  });

  it("mezcla negrita y código en el mismo texto", () => {
    const tokens = splitInlineMarkdown("**A** y `B`");
    expect(tokens).toEqual([
      { type: "bold", content: "A" },
      { type: "text", content: " y " },
      { type: "code", content: "B" },
    ]);
  });

  it("devuelve texto plano como token único", () => {
    expect(splitInlineMarkdown("sin formato")).toEqual([
      { type: "text", content: "sin formato" },
    ]);
  });

  it("devuelve [] para texto vacío", () => {
    expect(splitInlineMarkdown("")).toEqual([]);
  });

  it("trata comillas literales como texto (sin delimitador de apertura)", () => {
    // "fin**" sin apertura → no es negrita; el split solo captura pares completos
    const tokens = splitInlineMarkdown("fin**");
    expect(tokens).toEqual([{ type: "text", content: "fin**" }]);
  });
});
