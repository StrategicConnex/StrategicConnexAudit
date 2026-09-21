import { FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * ExecBriefSection — Resumen ejecutivo IA en el portal cliente (Sprint 3).
 *
 * Renderiza el contenido markdown-lite generado por `exec-brief.ts`
 * (headline `##`, párrafos, etiquetas `**X**` y listas `- `) como nodos
 * React — sin dangerouslySetInnerHTML: el origen es propio, pero el
 * renderizado queda acotado al formato que el servicio produce.
 *
 * Sin brief (null) no se renderiza nada: el portal no muestra huecos vacíos
 * (proyectos aún sin auditoría completada, IA sin generar, brief antiguo
 * reemplazado…).
 */

interface ExecBriefSectionProps {
  content: string | null;
  isFallback?: boolean;
  /** Fecha del brief (created_at de la fila viva) para el pie de sección. */
  updatedAt?: Date | null;
}

/** Parsea el markdown-lite a bloques tipados (headline/párrafo/lista/etiqueta). */
type Block =
  | { kind: "headline"; text: string }
  | { kind: "label"; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; items: string[] };

function parseBrief(content: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (line.startsWith("## ")) {
      blocks.push({ kind: "headline", text: line.slice(3) });
    } else if (line.startsWith("- ")) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list") last.items.push(line.slice(2));
      else blocks.push({ kind: "list", items: [line.slice(2)] });
    } else if (/^\*\*.+\*\*$/.test(line)) {
      blocks.push({ kind: "label", text: line.slice(2, -2) });
    } else {
      blocks.push({ kind: "para", text: line });
    }
  }
  return blocks;
}

export function ExecBriefSection({ content, isFallback, updatedAt }: ExecBriefSectionProps) {
  if (!content) return null;

  const blocks = parseBrief(content);

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-muted-fg">
          <FileText aria-hidden="true" className="h-4 w-4" />
          Resumen ejecutivo
        </h2>
        {isFallback ? (
          <span className="text-2xs text-muted-fg">resumen automático</span>
        ) : null}
      </div>

      <div className="mt-4 space-y-3 text-sm leading-relaxed">
        {blocks.map((b, i) => {
          switch (b.kind) {
            case "headline":
              return (
                <p key={i} className="font-display text-lg font-bold tracking-tight text-foreground">
                  {b.text}
                </p>
              );
            case "label":
              return (
                <p key={i} className="pt-2 text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
                  {b.text}
                </p>
              );
            case "list":
              return (
                <ul key={i} className="space-y-1.5">
                  {b.items.map((item, j) => (
                    <li key={j} className="flex gap-2">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              );
            default:
              return (
                <p key={i} className="text-foreground/90">
                  {b.text}
                </p>
              );
          }
        })}
      </div>

      {updatedAt ? (
        <p className="mt-5 border-t border-border/50 pt-3 text-2xs text-muted-fg">
          Generado el{" "}
          {new Date(updatedAt).toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      ) : null}
    </Card>
  );
}
