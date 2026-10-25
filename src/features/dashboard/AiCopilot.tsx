'use client';

import { useState, useRef, useEffect, isValidElement, type ReactNode } from 'react';
import { X, Send, Sparkles, Loader2, Minimize2, Maximize2, ShieldAlert, FileText, Activity } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidBlock } from './MermaidBlock';
import { useTranslations } from 'next-intl';

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

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** true = fallo del servicio (no es una respuesta del modelo). */
  isError?: boolean;
}

type CopilotMode = 'copilot' | 'analyst';

export function AiCopilot({ contextData, onGeneratingChange }: {
  contextData: unknown;
  /** Notifica al exterior (ej. red neuronal) cuando empieza/termina una generación. */
  onGeneratingChange?: (generating: boolean) => void;
}) {
  const t = useTranslations('chat');
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<CopilotMode>('copilot');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('greetingCopilot') }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Al cerrar con Escape hay que enfocar el disparador DESPUÉS del re-render. */
  const shouldFocusTriggerRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      if (shouldFocusTriggerRef.current) {
        shouldFocusTriggerRef.current = false;
        triggerRef.current?.focus();
      }
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      shouldFocusTriggerRef.current = true;
      setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSend = async (text?: string, options?: { retry?: boolean }) => {
    const userMsg = (text || input).trim();
    if (!userMsg || isLoading) return;

    if (!text) setInput('');

    // En reintento se retira la burbuja de error final; el mensaje del usuario
    // sigue en el historial (no se duplica).
    const baseMessages: Message[] = options?.retry
      ? messages.filter((m, i) => !(i === messages.length - 1 && m.isError))
      : [...messages, { role: 'user', content: userMsg }];
    setMessages(baseMessages);
    setIsLoading(true);
    onGeneratingChange?.(true);

    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Los estados de error no forman parte de la conversación enviada.
          messages: baseMessages
            .filter((m) => !m.isError)
            .map(({ role, content }) => ({ role, content })),
          context: contextData,
          mode
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || data.success !== true || typeof data.message !== 'string') {
        throw new Error(
          data?.error || data?.message || t('httpError', { status: response.status }),
        );
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      setLastFailedPrompt(null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : t('connError');
      setLastFailedPrompt(userMsg);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: t('errorUnavailable', { detail }), isError: true },
      ]);
    } finally {
      setIsLoading(false);
      onGeneratingChange?.(false);
    }
  };

  const quickQuestions = mode === 'analyst'
    ? [t('quickAnalyst1'), t('quickAnalyst2'), t('quickAnalyst3')]
    : [t('quickCopilot1'), t('quickCopilot2'), t('quickCopilot3')];

  if (!isOpen) {
    return (
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
        aria-label={t('openAria')}
        aria-haspopup="dialog"
        className="fixed bottom-24 right-4 sm:bottom-8 sm:right-8 mb-[env(safe-area-inset-bottom)] p-5 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-[0_0_20px_rgba(98,113,196,0.3)] border-2 border-primary/30 hover:scale-105 hover:shadow-[0_0_30px_rgba(98,113,196,0.5)] hover:border-primary/50 transition-[color,background-color,border-color,box-shadow,transform] duration-300 z-50 flex items-center justify-center group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Sparkles aria-hidden="true" className="w-5 h-5 animate-pulse text-primary-foreground/80" strokeWidth={2.5} />
        <span className="max-w-0 overflow-hidden group-hover:max-w-[140px] transition-[max-width,padding] duration-300 font-extrabold text-2xs uppercase tracking-widest whitespace-nowrap px-0 group-hover:px-2 text-primary-foreground">
          {t('title')}
        </span>
      </button>
    );
  }

  return (
    <div role="dialog" aria-label={t('dialogAria')} className={`fixed bottom-24 right-4 sm:bottom-8 sm:right-8 mb-[env(safe-area-inset-bottom)] glass-card border-2 border-primary/25 shadow-[0_8px_40px_-12px_oklch(0%_0_0/0.6),0_0_0_1px_oklch(14%_0.012_100/0.1)] rounded-2xl flex flex-col z-50 transition-[width,height,max-height] duration-500 ease-in-out animate-in slide-in-from-bottom-10 fade-in ${isExpanded ? 'w-[700px] max-w-[calc(100vw-2rem)] h-[85vh]' : 'w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[85vh]'}`}>
      {/* Header */}
      <div className="flex flex-col border-b-2 border-primary/15 bg-card/90 rounded-t-2xl shrink-0 backdrop-blur-xl">
        <div className="flex items-center justify-between p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-colors ${mode === 'analyst' ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-primary/10 border-primary/30 text-primary'}`}>
              {mode === 'analyst' ? <ShieldAlert className="w-4 h-4" strokeWidth={2.5} /> : <Sparkles className="w-4 h-4" strokeWidth={2.5} />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground tracking-tight">
                {mode === 'analyst' ? t('analystModeTitle') : t('title')}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${mode === 'analyst' ? 'bg-destructive' : 'bg-primary'}`}></span>
                <span className={`text-2xs font-extrabold uppercase tracking-widest ${mode === 'analyst' ? 'text-destructive' : 'text-primary'}`}>
                  {t('engineActive')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsExpanded(!isExpanded)} 
              aria-label={isExpanded ? t('collapseAria') : t('expandAria')}
              className="p-2 hover:bg-muted/30 rounded-lg text-muted-fg hover:text-foreground transition-colors border border-transparent hover:border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              title={isExpanded ? t('collapseTitle') : t('expandTitle')}
            >
              {isExpanded ? <Minimize2 aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Maximize2 aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2.5} />}
            </button>
            <button 
              onClick={() => setIsOpen(false)} 
              aria-label={t('closeAria')}
              className="p-2 hover:bg-muted/30 rounded-lg text-muted-fg hover:text-foreground transition-colors border border-transparent hover:border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              title={t('closeTitle')}
            >
              <X aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="px-5 pb-3">
          <div className="bg-muted/15 border border-border/60 p-1 rounded-lg flex items-center gap-1">
            <button
              onClick={() => { setMode('copilot'); setLastFailedPrompt(null); setMessages([{ role: 'assistant', content: t('greetingCopilot') }]); }}
              className={`flex-1 text-2xs font-extrabold uppercase tracking-widest py-1.5 rounded-md transition-[color,background-color,box-shadow,border-color] border ${mode === 'copilot' ? 'bg-primary/15 text-foreground shadow-sm border-primary/25' : 'text-muted-fg hover:text-foreground/80 border-transparent'}`}
            >
              {t('modeCopilot')}
            </button>
            <button
              onClick={() => { setMode('analyst'); setLastFailedPrompt(null); setMessages([{ role: 'assistant', content: t('greetingAnalyst') }]); }}
              className={`flex-1 text-2xs font-extrabold uppercase tracking-widest py-1.5 rounded-md transition-[color,background-color,box-shadow,border-color] border ${mode === 'analyst' ? 'bg-destructive/15 text-destructive shadow-sm border-destructive/25' : 'text-muted-fg hover:text-foreground/80 border-transparent'}`}
            >
              {t('modeAnalyst')}
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={isLoading}
        aria-label={t('logAria')}
        className="flex-1 overflow-y-auto p-5 space-y-4 bg-background/40"
      >
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed border-2 ${
              msg.role === 'user'
                ? (mode === 'analyst' ? 'bg-destructive/30 text-foreground border-destructive/25 shadow-md font-semibold' : 'bg-primary/30 text-foreground border-primary/25 shadow-md font-semibold')
                : msg.isError
                  ? 'bg-destructive/10 text-destructive border-destructive/40 font-medium'
                  : 'bg-muted/25 text-foreground/80 border-border/60 font-medium'
            }`}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                  {msg.content}
                </ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
              {msg.isError && idx === messages.length - 1 && lastFailedPrompt && (
                <button
                  type="button"
                  onClick={() => void handleSend(lastFailedPrompt, { retry: true })}
                  className="mt-2 inline-flex items-center rounded-md border border-destructive/40 px-2 py-1 text-2xs font-extrabold uppercase tracking-widest text-destructive transition-colors hover:bg-destructive/10"
                >
                  {t('retry')}
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted/15 border-2 border-border/50 rounded-xl px-4 py-3 flex items-center gap-2.5">
              <Loader2 className={`w-3.5 h-3.5 animate-spin ${mode === 'analyst' ? 'text-destructive' : 'text-primary'}`} />
              <span className="text-2xs font-extrabold text-muted-fg uppercase tracking-widest animate-pulse">{t('generating')}</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      {messages.length <= 2 && !isLoading && (
        <div className="px-5 py-3 border-t-2 border-border/40 flex gap-2 overflow-x-auto shrink-0">
          {quickQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              className="text-2xs font-bold uppercase tracking-wider whitespace-nowrap bg-muted/25 hover:bg-muted/50 border-2 border-border/60 text-muted-fg hover:text-foreground px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {mode === 'analyst' ? <Activity className="w-3 h-3 text-destructive/50" /> : <FileText className="w-3 h-3 text-primary/50" />}
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-5 border-t-2 border-primary/10 shrink-0 bg-card rounded-b-2xl">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="relative"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={mode === 'analyst' ? t('placeholderAnalyst') : t('placeholderCopilot')}
            className={`w-full bg-muted/50 border-2 border-border/60 focus:border-primary/50 rounded-xl px-4 py-3.5 pr-14 text-xs font-medium text-foreground placeholder:text-muted-fg outline-none resize-none max-h-32 transition-colors duration-300 focus:ring-2 focus:ring-primary/15`}
            rows={1}
            style={{ minHeight: '50px' }}
          />
          <button
            type="submit"
            aria-label={t('sendAria')}
            disabled={!input.trim() || isLoading}
            className={`absolute right-2 top-2 p-2 rounded-lg text-foreground disabled:opacity-20 transition-[color,background-color,opacity,box-shadow,border-color] cursor-pointer shadow-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              mode === 'analyst' 
                ? 'bg-destructive hover:bg-destructive/80 hover:shadow-[0_0_15px_rgba(200,50,55,0.3)] border-destructive/30 hover:border-destructive/50' 
                : 'bg-primary hover:bg-primary/80 hover:shadow-[0_0_15px_rgba(98,113,196,0.3)] border-primary/30 hover:border-primary/50'
            }`}
          >
            <Send aria-hidden="true" className={`w-3.5 h-3.5 ${mode === 'analyst' ? 'text-destructive-foreground' : 'text-primary-foreground'}`} strokeWidth={2.5} />
          </button>
        </form>
        <p className="mt-3 text-2xs font-extrabold text-center text-muted-fg uppercase tracking-widest">
          {t('disclaimer')}
        </p>
      </div>
    </div>
  );
}
