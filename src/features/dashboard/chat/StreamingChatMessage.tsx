"use client";

import { useEffect, useRef, useState, isValidElement, type ReactNode } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import { MermaidBlock } from "../MermaidBlock";

/**
 * Renderer Markdown del copilot. react-markdown NO interpreta HTML crudo
 * (sin rehype-raw), así que la salida del modelo nunca se inyecta como HTML:
 * la garantía anti-XSS de VULN-001 se mantiene sin `dangerouslySetInnerHTML`.
 */
const MARKDOWN_COMPONENTS: Components = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
      const className = child.props.className ?? '';
      const code = String(child.props.children ?? '').replace(/\n$/, '');
      if (className.includes('language-mermaid')) {
        return <MermaidBlock code={code} />;
      }
      return (
        <pre className="my-2 overflow-x-auto rounded-lg border border-border/50 bg-background/60 p-3 text-[11px] leading-relaxed">
          <code className="font-mono">{code}</code>
        </pre>
      );
    }
    return (
      <pre className="my-2 overflow-x-auto rounded-lg border border-border/50 bg-background/60 p-3 text-[11px] leading-relaxed">
        {children}
      </pre>
    );
  },
  code({ children, className }) {
    return (
      <code className={`rounded bg-muted/40 px-1 py-0.5 font-mono text-[11px] ${className ?? ''}`}>
        {children}
      </code>
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-words text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[11px]">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="border border-border/50 bg-muted/30 px-2 py-1 font-bold">{children}</th>;
  },
  td({ children }) {
    return <td className="border border-border/50 px-2 py-1 align-top">{children}</td>;
  },
  h1({ children }) {
    return <h1 className="mb-1 mt-3 text-sm font-extrabold text-foreground">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-1 mt-3 text-xs font-extrabold text-foreground">{children}</h2>;
  },
  h3({ children }) {
    return (
      <h3 className="mb-1 mt-3 text-xs font-extrabold uppercase tracking-wide text-foreground">
        {children}
      </h3>
    );
  },
  h4({ children }) {
    return (
      <h4 className="mb-1 mt-3 text-xs font-extrabold uppercase tracking-wide text-foreground">
        {children}
      </h4>
    );
  },
  ul({ children }) {
    return <ul className="my-1.5 list-disc space-y-0.5 pl-4">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-1.5 list-decimal space-y-0.5 pl-4">{children}</ol>;
  },
  p({ children }) {
    return <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-muted-fg">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-3 border-border/50" />;
  },
  strong({ children }) {
    return <strong className="font-bold text-foreground">{children}</strong>;
  },
};

export interface ChatBubbleMessage {
  role: "user" | "assistant";
  content: string;
  /** true = fallo del servicio (no es una respuesta del modelo). */
  isError?: boolean;
  /** true = respuesta del asistente aún en streaming (caret de cursor). */
  isStreaming?: boolean;
}

export interface StreamingChatMessageProps {
  message: ChatBubbleMessage;
  /** Modo visual (copilot vs analyst): colores de la burbuja. */
  mode: "copilot" | "analyst";
  /** Es el último mensaje de la conversación (habilita Regenerar/Reintentar). */
  isLast: boolean;
  /** Reenvía la última pregunta generando una respuesta nueva. */
  onRegenerate?: () => void;
  /** Reintenta tras un error (mismo mensaje del usuario). */
  onRetry?: () => void;
}

/**
 * Burbuja de un mensaje del chat. Además del Markdown, gestiona las acciones
 * de Sprint 1: **Copiar** respuesta (asistente, con feedback "¡Copiado!"),
 * **Regenerar** (último mensaje del asistente) y **Reintentar** (último
 * mensaje de error). El caret parpadea mientras `isStreaming` es true.
 */
export function StreamingChatMessage({
  message,
  mode,
  isLast,
  onRegenerate,
  onRetry,
}: StreamingChatMessageProps) {
  const t = useTranslations("chat");
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText?.(message.content);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin clipboard (contexto no seguro / permiso denegado): sin feedback,
      // nunca un crash por un botón de conveniencia.
    }
  };

  const isAssistant = message.role === "assistant";
  const showCopy = isAssistant && !message.isError && !message.isStreaming && message.content.length > 0;
  const showRegenerate =
    isAssistant && isLast && !message.isError && !message.isStreaming && !!onRegenerate;

  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%]">
        <div className={`rounded-xl px-4 py-3 text-xs leading-relaxed border-2 ${
          message.role === 'user'
            ? (mode === 'analyst' ? 'bg-destructive/30 text-foreground border-destructive/25 shadow-md font-semibold' : 'bg-primary/30 text-foreground border-primary/25 shadow-md font-semibold')
            : message.isError
              ? 'bg-destructive/10 text-destructive border-destructive/40 font-medium'
              : 'bg-muted/25 text-foreground/80 border-border/60 font-medium'
        }`}>
          {isAssistant ? (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {message.content}
              </ReactMarkdown>
              {message.isStreaming && (
                <span
                  aria-hidden="true"
                  className="inline-block w-1.5 h-3 bg-primary animate-pulse ml-0.5 align-text-bottom"
                />
              )}
            </>
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
          {message.isError && isLast && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center rounded-md border border-destructive/40 px-2 py-1 text-2xs font-extrabold uppercase tracking-widest text-destructive transition-colors hover:bg-destructive/10"
            >
              {t('retry')}
            </button>
          )}
        </div>
        {(showCopy || showRegenerate) && (
          <div className="mt-1 flex items-center gap-1">
            {showCopy && (
              <button
                type="button"
                onClick={() => void handleCopy()}
                aria-label={copied ? t('copied') : t('copyMessage')}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/20 px-2 py-1 text-2xs font-extrabold uppercase tracking-widest text-muted-fg transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {copied ? <Check aria-hidden="true" className="w-3 h-3 text-primary" /> : <Copy aria-hidden="true" className="w-3 h-3" />}
                {copied ? t('copied') : t('copyMessage')}
              </button>
            )}
            {showRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                aria-label={t('regenerate')}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/20 px-2 py-1 text-2xs font-extrabold uppercase tracking-widest text-muted-fg transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <RefreshCw aria-hidden="true" className="w-3 h-3" />
                {t('regenerate')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
