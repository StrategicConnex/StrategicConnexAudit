/**
 * rendering/markdown.ts — Paquete puro de rendering para markdown (módulo hoja C01).
 *
 * Funciones puras sin dependencias de React, estado ni librerías externas.
 * Extraídas de IntelligenceTab para ser testables de forma aislada:
 *   - parseMarkdown()        → divide markdown en bloques estructurados
 *   - splitInlineMarkdown()  → divide texto inline en tokens (negrita/código/plano)
 */

export interface RenderedBlock {
  type: 'h1' | 'h2' | 'h3' | 'code' | 'ul' | 'ol' | 'p';
  content?: string;
  items?: string[];
  language?: string;
}

/** Token de texto inline para renderizar negritas y código sin XSS. */
export interface InlineToken {
  type: 'bold' | 'code' | 'text';
  content: string;
}

/**
 * Convierte markdown en una lista ordenada de bloques renderizables.
 * Soporta: títulos (H1-H3), bloques de código (fences ```), listas
 * ul/ol (con agrupación de ítems consecutivos) y párrafos (con quiebres).
 */
export function parseMarkdown(md: string): RenderedBlock[] {
  const lines = md.split('\n');
  const blocks: RenderedBlock[] = [];
  let currentBlock: RenderedBlock | null = null;
  let codeLines: string[] = [];
  let inCode = false;
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inCode) {
        blocks.push({
          type: 'code',
          content: joinCodeLines(codeLines),
          language: codeLang || 'code'
        });
        codeLines = [];
        inCode = false;
        codeLang = '';
      } else {
        inCode = true;
        codeLang = line.trim().substring(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', content: trimmed.substring(4) });
      currentBlock = null;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', content: trimmed.substring(3) });
      currentBlock = null;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', content: trimmed.substring(2) });
      currentBlock = null;
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemContent = trimmed.substring(2);
      if (currentBlock && currentBlock.type === 'ul') {
        currentBlock.items?.push(itemContent);
      } else {
        currentBlock = { type: 'ul', items: [itemContent] };
        blocks.push(currentBlock);
      }
      continue;
    }

    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      const itemContent = olMatch[2];
      if (currentBlock && currentBlock.type === 'ol') {
        currentBlock.items?.push(itemContent);
      } else {
        currentBlock = { type: 'ol', items: [itemContent] };
        blocks.push(currentBlock);
      }
      continue;
    }

    if (trimmed === '') {
      currentBlock = null;
      continue;
    }

    if (currentBlock && currentBlock.type === 'p') {
      currentBlock.content += '\n' + line;
    } else {
      currentBlock = { type: 'p', content: line };
      blocks.push(currentBlock);
    }
  }

  if (inCode && codeLines.length > 0) {
    blocks.push({
      type: 'code',
      content: joinCodeLines(codeLines),
      language: codeLang || 'code'
    });
  }

  return blocks;
}

/** Une líneas de código recortando UN salto de línea final (línea vacía final).
 * Un solo `\n$` preserva líneas en blanco intencionales antes del fence de
 * cierre (byte-parity con la implementación original) mientras corrige el
 * caso de fence sin cerrar con entrada terminada en \n. */
function joinCodeLines(codeLines: string[]): string {
  return codeLines.join('\n').replace(/\n$/, '');
}

/**
 * Divide texto inline en tokens tipados: **negrita**, `código` y texto plano.
 * El split preserva los delimitadores para distinguirlos del texto literal;
 * los fragmentos vacíos generados por el regex se filtran (renderizan nada).
 */
export function splitInlineMarkdown(text: string): InlineToken[] {
  if (!text) return [];
  return text
    .split(/(\*\*.*?\*\*|`.*?`)/g)
    .filter((part) => part !== '')
    .map((part): InlineToken => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return { type: 'bold', content: part.slice(2, -2) };
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return { type: 'code', content: part.slice(1, -1) };
      }
      return { type: 'text', content: part };
    });
}
