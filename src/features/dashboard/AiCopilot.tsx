'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Square, Sparkles, Minimize2, Maximize2, ShieldAlert, FileText, Activity } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StreamingChatMessage, type ChatBubbleMessage } from './chat/StreamingChatMessage';
import { TypingIndicator } from './chat/TypingIndicator';
import { useChatHistory } from './chat/useChatHistory';
import { consumeChatStream, isEventStreamResponse } from './chat/chat-stream';

type Message = ChatBubbleMessage;

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
  /** Stream en vuelo: el botón Stop lo aborta (Task 1.2). */
  const abortRef = useRef<AbortController | null>(null);

  // Historial persistente por modo (Sprint 1, localStorage; Supabase en Sprint 3)
  const { load, save } = useChatHistory(mode);

  // Restauración del historial: patrón "adjust state during render" (React
  // docs) en lugar de un effect con setState (react-hooks/set-state-in-
  // effect). Al abrir el diálogo o cambiar de modo, la conversación de ese
  // modo reemplaza la actual; sin historial, el saludo de bienvenida.
  const historyKey = isOpen ? mode : null;
  const [prevHistoryKey, setPrevHistoryKey] = useState<string | null>(null);
  if (historyKey !== prevHistoryKey) {
    setPrevHistoryKey(historyKey);
    if (historyKey !== null) {
      const saved = load();
      setMessages(
        saved.length > 0
          ? saved
          : [{ role: 'assistant', content: mode === 'analyst' ? t('greetingAnalyst') : t('greetingCopilot') }],
      );
      setLastFailedPrompt(null);
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Persistencia: se guarda con cada cambio de conversación (errores y
  // respuestas a medio generar los filtra el propio guardado).
  useEffect(() => {
    if (!isOpen) return;
    save(messages);
  }, [messages, isOpen, save]);

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

  const handleSend = async (
    text?: string,
    options?: { retry?: boolean; regenerate?: boolean },
  ) => {
    const userMsg = (text || input).trim();
    if (!userMsg || isLoading) return;

    if (!text) setInput('');

    // retry: se retira la burbuja de error final (el mensaje del usuario sigue
    // en el historial, no se duplica). regenerate: se retira la última
    // respuesta del asistente a regenerar. Normal: se appendea el usuario.
    const baseMessages: Message[] = options?.retry
      ? messages.filter((m, i) => !(i === messages.length - 1 && m.isError))
      : options?.regenerate
        ? messages.slice(0, -1)
        : [...messages, { role: 'user', content: userMsg }];

    // Placeholder del asistente: recibe los chunks a medida que llegan.
    const assistantIndex = baseMessages.length;
    setMessages([...baseMessages, { role: 'assistant', content: '', isStreaming: true }]);
    setIsLoading(true);
    onGeneratingChange?.(true);

    // AbortController por envío: Stop cancela la petición y el stream.
    // Sin envíos concurrentes (isLoading lo bloquea), así que uno nuevo por
    // envío no pisa el de otro.
    const controller = new AbortController();
    abortRef.current = controller;

    const patchAssistant = (patch: Partial<Message>) => {
      setMessages(prev => {
        const next = [...prev];
        const current = next[assistantIndex] ?? { role: 'assistant' as const, content: '' };
        next[assistantIndex] = { ...current, ...patch, role: 'assistant' as const };
        return next;
      });
    };

    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: true,
          // Los estados de error no forman parte de la conversación enviada.
          messages: baseMessages
            .filter((m) => !m.isError && !m.isStreaming)
            .map(({ role, content }) => ({ role, content })),
          context: contextData,
          mode
        }),
        signal: controller.signal,
      });

      if (isEventStreamResponse(response)) {
        // Streaming (Sprint 1): el texto aparece progresivamente en el
        // placeholder del asistente.
        const outcome = await consumeChatStream(response, {
          onChunk: (delta) => {
            setMessages(prev => {
              const next = [...prev];
              const current = next[assistantIndex];
              if (!current) return prev;
              next[assistantIndex] = { ...current, content: current.content + delta };
              return next;
            });
          },
        });
        if (!outcome.ok) {
          // Stream cortado o terminado con evento error: se conserva el texto
          // parcial y se marca como error (reintentable).
          throw new Error(outcome.error || t('connError'));
        }
        patchAssistant({ isStreaming: false });
      } else {
        // JSON histórico (onboarding sin claves, fallo del pool, proxies…).
        const data = await response.json().catch(() => null);

        if (!response.ok || !data || data.success !== true || typeof data.message !== 'string') {
          throw new Error(
            data?.error || data?.message || t('httpError', { status: response.status }),
          );
        }

        patchAssistant({ content: data.message, isStreaming: false });
      }
      setLastFailedPrompt(null);
    } catch (error) {
      if (controller.signal.aborted) {
        // Stop pulsado: NO es un fallo del servicio. Se conserva el texto
        // parcial recibido (sin marcar error) y, si no llegó nada, se retira
        // el placeholder vacío para no dejar una burbuja en blanco.
        setMessages(prev => {
          const next = [...prev];
          const current = next[assistantIndex];
          if (!current) return prev;
          if (current.content === '') {
            next.splice(assistantIndex, 1);
            return next;
          }
          next[assistantIndex] = { ...current, isStreaming: false };
          return next;
        });
        return;
      }
      const detail = error instanceof Error ? error.message : t('connError');
      setLastFailedPrompt(userMsg);
      // Texto parcial del stream (si lo hubo) se conserva junto al error.
      setMessages(prev => {
        const next = [...prev];
        const partial = next[assistantIndex]?.content ?? '';
        next[assistantIndex] = {
          role: 'assistant',
          content: partial
            ? `${partial}\n\n---\n${t('errorUnavailable', { detail })}`
            : t('errorUnavailable', { detail }),
          isError: true,
        };
        return next;
      });
    } finally {
      setIsLoading(false);
      onGeneratingChange?.(false);
      abortRef.current = null;
    }
  };

  /** Cancela el stream en vuelo conservando el texto parcial (Task 1.2). */
  const handleStop = () => {
    abortRef.current?.abort();
  };

  const quickQuestions = mode === 'analyst'
    ? [t('quickAnalyst1'), t('quickAnalyst2'), t('quickAnalyst3')]
    : [t('quickCopilot1'), t('quickCopilot2'), t('quickCopilot3')];

  /** Última pregunta real (para Regenerar / Reintentar). */
  const lastUserPrompt = [...messages]
    .reverse()
    .find((m) => m.role === 'user' && !m.isError)?.content;
  /** ¿Queda un placeholder esperando el primer chunk del stream? */
  const waitingFirstChunk = messages.some((m) => m.isStreaming && m.content === '');

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

        {/* Mode Toggle: cambiar de modo restaura SU conversación (useEffect) */}
        <div className="px-5 pb-3">
          <div className="bg-muted/15 border border-border/60 p-1 rounded-lg flex items-center gap-1">
            <button
              onClick={() => setMode('copilot')}
              className={`flex-1 text-2xs font-extrabold uppercase tracking-widest py-1.5 rounded-md transition-[color,background-color,box-shadow,border-color] border ${mode === 'copilot' ? 'bg-primary/15 text-foreground shadow-sm border-primary/25' : 'text-muted-fg hover:text-foreground/80 border-transparent'}`}
            >
              {t('modeCopilot')}
            </button>
            <button
              onClick={() => setMode('analyst')}
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
        {messages.map((msg, idx) => {
          // El placeholder vacío aún no tiene contenido: se pinta el
          // indicador de "escribiendo…" en su lugar.
          if (msg.isStreaming && msg.content === '') return null;
          return (
            <StreamingChatMessage
              key={idx}
              message={msg}
              mode={mode}
              isLast={idx === messages.length - 1}
              onRegenerate={
                idx === messages.length - 1 && lastUserPrompt && !isLoading
                  ? () => void handleSend(lastUserPrompt, { regenerate: true })
                  : undefined
              }
              onRetry={
                idx === messages.length - 1 && msg.isError && lastFailedPrompt
                  ? () => void handleSend(lastFailedPrompt, { retry: true })
                  : undefined
              }
            />
          );
        })}
        {waitingFirstChunk && <TypingIndicator label={t('generating')} />}
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
          {isLoading ? (
            // Stop reemplaza al envío mientras hay un stream en vuelo:
            // cancelar deja el parcial y libera la cuota no consumida.
            <button
              type="button"
              onClick={handleStop}
              aria-label={t('stop')}
              title={t('stop')}
              className={`absolute right-2 top-2 p-2 rounded-lg text-foreground cursor-pointer shadow-md border-2 transition-[color,background-color,box-shadow,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                mode === 'analyst'
                  ? 'bg-destructive hover:bg-destructive/80 border-destructive/30 hover:border-destructive/50 text-destructive-foreground'
                  : 'bg-primary hover:bg-primary/80 border-primary/30 hover:border-primary/50 text-primary-foreground'
              }`}
            >
              <Square aria-hidden="true" className="w-3 h-3 fill-current" strokeWidth={2.5} />
            </button>
          ) : (
            <button
              type="submit"
              aria-label={t('sendAria')}
              disabled={!input.trim()}
              className={`absolute right-2 top-2 p-2 rounded-lg text-foreground disabled:opacity-20 transition-[color,background-color,opacity,box-shadow,border-color] cursor-pointer shadow-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                mode === 'analyst'
                  ? 'bg-destructive hover:bg-destructive/80 hover:shadow-[0_0_15px_rgba(200,50,55,0.3)] border-destructive/30 hover:border-destructive/50'
                  : 'bg-primary hover:bg-primary/80 hover:shadow-[0_0_15px_rgba(98,113,196,0.3)] border-primary/30 hover:border-primary/50'
              }`}
            >
              <Send aria-hidden="true" className={`w-3.5 h-3.5 ${mode === 'analyst' ? 'text-destructive-foreground' : 'text-primary-foreground'}`} strokeWidth={2.5} />
            </button>
          )}
        </form>
        <p className="mt-3 text-2xs font-extrabold text-center text-muted-fg uppercase tracking-widest">
          {t('disclaimer')}
        </p>
      </div>
    </div>
  );
}
