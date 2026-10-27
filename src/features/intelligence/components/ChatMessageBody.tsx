"use client";

import { useTranslations } from "next-intl";
import { citationHref, splitCitationTokens } from "@/shared/lib/chat-citations";
import type { ChatReference } from "@/shared/types/chat";

interface ChatMessageBodyProps {
  text: string;
  references?: ChatReference[];
  unverifiedCount?: number;
  /** Si existe, el clic abre la evidencia sin recargar la página. */
  onOpenReference?: (findingId: string) => void;
}

/**
 * Cuerpo de un mensaje del copiloto con citas verificadas.
 *
 * Solo los tokens `[[ref:n]]` con una referencia existente se convierten en
 * enlace. Cualquier otro token se pinta literal: un marcador que el servidor
 * no pudo verificar nunca se convierte en link.
 */
export function ChatMessageBody({
  text,
  references = [],
  unverifiedCount = 0,
  onOpenReference,
}: ChatMessageBodyProps) {
  const t = useTranslations("chat");
  const segments = splitCitationTokens(text);

  return (
    <>
      <p className="leading-relaxed whitespace-pre-wrap">
        {segments.map((segment, index) => {
          if (segment.type === "text") {
            return <span key={index}>{segment.value}</span>;
          }

          const reference = references[segment.index - 1];
          if (!reference) {
            return <span key={index}>{segment.raw}</span>;
          }

          return (
            <a
              key={index}
              href={citationHref(reference.id)}
              onClick={(event) => {
                if (!onOpenReference) return;
                event.preventDefault();
                onOpenReference(reference.id);
              }}
              title={reference.title}
              className="mx-0.5 font-mono font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
            >
              [{segment.index}]
            </a>
          );
        })}
      </p>

      {references.length > 0 && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-2xs font-mono uppercase tracking-wide opacity-60">
            {t("referencesLabel")}
          </p>
          <ul className="mt-1 space-y-0.5">
            {references.map((reference, index) => (
              <li key={reference.id} className="text-2xs leading-relaxed">
                <a
                  href={citationHref(reference.id)}
                  onClick={(event) => {
                    if (!onOpenReference) return;
                    event.preventDefault();
                    onOpenReference(reference.id);
                  }}
                  className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
                >
                  [{index + 1}] {reference.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unverifiedCount > 0 && (
        <p className="mt-1 text-2xs font-mono opacity-60" role="status">
          {t("citationUnverified", { count: unverifiedCount })}
        </p>
      )}
    </>
  );
}
