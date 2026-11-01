import { readFileSync } from "fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://localhost/",
});
global.window = dom.window;
global.document = dom.window.document;
if (!dom.window.matchMedia) {
  dom.window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}

// Import dinámico obligatorio: dompurify (dentro de mermaid) se enlaza al DOM en el
// momento del import. Un `import` estático se evalúa antes de montar jsdom, deja
// DOMPurify como factory y todo parseo falla con "DOMPurify.addHook is not a function".
const { default: mermaid } = await import("mermaid");

mermaid.initialize({ startOnLoad: false, logLevel: "fatal" });

// CRLF-tolerant: `core.autocrlf=true` checks these files out with \r\n on Windows.
const mdContent = readFileSync("docs/architecture/MERMAID-DIAGRAMS.md", "utf8");
const htmlContent = readFileSync("docs/architecture/diagram-preview.html", "utf8");

const mdBlocks = mdContent.match(/```mermaid\r?\n([\s\S]*?)```/g) || [];
const htmlBlocks = htmlContent.match(/<div class="mermaid">\r?\n?([\s\S]*?)<\/div>/g) || [];

const total = mdBlocks.length + htmlBlocks.length;
if (total === 0) {
  // A regex that stops matching would otherwise report "0 blocks, 0 errors" and pass.
  console.error(
    "Parse error: no se encontró ningún bloque Mermaid (¿cwd incorrecto o fences rotos?)"
  );
  process.exit(1);
}

let errors = 0;
const blocks = [...mdBlocks, ...htmlBlocks];
for (const [index, block] of blocks.entries()) {
  const code = block.replace(/```mermaid\r?\n|```|<div class="mermaid">|<\/div>/g, "").trim();
  try {
    await mermaid.parse(code);
  } catch (e) {
    console.error(`Parse error (bloque ${index + 1}) [${code.split(/\r?\n/)[0]}]:`, e.message);
    errors++;
  }
}

console.log(`Validated ${total} blocks, ${errors} errors`);
process.exit(errors > 0 ? 1 : 0);
