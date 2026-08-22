'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Loader2, Minimize2, Maximize2, ShieldAlert, FileText, Activity } from 'lucide-react';
import { escapeHtml } from './report-utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type CopilotMode = 'copilot' | 'analyst';

export function AiCopilot({ contextData, onGeneratingChange }: {
  contextData: unknown;
  /** Notifica al exterior (ej. red neuronal) cuando empieza/termina una generación. */
  onGeneratingChange?: (generating: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<CopilotMode>('copilot');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hola. Soy Strategic Copilot. ¿En qué te puedo ayudar hoy? Puedo analizar reportes, priorizar tareas o explicarte problemas técnicos.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || isLoading) return;

    if (!text) setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);
    onGeneratingChange?.(true);

    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          context: contextData,
          mode
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, ocurrió un error de conexión.' }]);
    } finally {
      setIsLoading(false);
      onGeneratingChange?.(false);
    }
  };

  const quickQuestions = mode === 'analyst' 
    ? ["Identificar vectores críticos", "Explicar drift reciente", "Resumir hallazgos"]
    : ["¿Qué debo priorizar?", "¿Cómo mejorar mi score?", "Generar plan de acción"];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Abrir Strategic Copilot"
        className="fixed bottom-8 right-8 p-5 rounded-full bg-gradient-to-r from-primary to-primary/80 text-foreground shadow-[0_0_20px_rgba(98,113,196,0.3)] border-2 border-primary/30 hover:scale-105 hover:shadow-[0_0_30px_rgba(98,113,196,0.5)] hover:border-primary/50 transition-[color,background-color,border-color,box-shadow,transform] duration-300 z-50 flex items-center justify-center group cursor-pointer"
      >
        <Sparkles aria-hidden="true" className="w-5 h-5 animate-pulse text-primary/80" strokeWidth={2.5} />
        <span className="max-w-0 overflow-hidden group-hover:max-w-[140px] transition-[max-width,padding] duration-300 font-extrabold text-[11px] uppercase tracking-widest whitespace-nowrap px-0 group-hover:px-2 text-foreground">
          Strategic Copilot
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-8 right-8 glass-card border-2 border-primary/25 shadow-[0_8px_40px_-12px_oklch(0%_0_0/0.6),0_0_0_1px_oklch(14%_0.012_100/0.1)] rounded-2xl flex flex-col z-50 transition-[width,height,max-height] duration-500 ease-in-out animate-in slide-in-from-bottom-10 fade-in ${isExpanded ? 'w-[700px] h-[85vh]' : 'w-[400px] h-[600px] max-h-[85vh]'}`}>
      {/* Header */}
      <div className="flex flex-col border-b-2 border-primary/15 bg-card/90 rounded-t-2xl shrink-0 backdrop-blur-xl">
        <div className="flex items-center justify-between p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-colors ${mode === 'analyst' ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-primary/10 border-primary/30 text-primary'}`}>
              {mode === 'analyst' ? <ShieldAlert className="w-4 h-4" strokeWidth={2.5} /> : <Sparkles className="w-4 h-4" strokeWidth={2.5} />}
            </div>
            <div>
              <h3 className="font-bold text-[14px] text-foreground tracking-tight">
                {mode === 'analyst' ? 'Analyst Mode' : 'Strategic Copilot'}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${mode === 'analyst' ? 'bg-destructive' : 'bg-primary'}`}></span>
                <span className={`text-[9px] font-extrabold uppercase tracking-widest ${mode === 'analyst' ? 'text-destructive' : 'text-primary'}`}>
                  Motor Activo
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsExpanded(!isExpanded)} 
              aria-label={isExpanded ? 'Colapsar panel' : 'Expandir panel'}
              className="p-2 hover:bg-muted/30 rounded-lg text-muted-fg hover:text-foreground transition-colors border border-transparent hover:border-border/50"
              title={isExpanded ? 'Colapsar' : 'Expandir'}
            >
              {isExpanded ? <Minimize2 aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Maximize2 aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2.5} />}
            </button>
            <button 
              onClick={() => setIsOpen(false)} 
              aria-label="Cerrar copilot"
              className="p-2 hover:bg-muted/30 rounded-lg text-muted-fg hover:text-foreground transition-colors border border-transparent hover:border-border/50"
              title="Cerrar"
            >
              <X aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="px-5 pb-3">
          <div className="bg-muted/15 border border-border/60 p-1 rounded-lg flex items-center gap-1">
            <button
              onClick={() => { setMode('copilot'); setMessages([{ role: 'assistant', content: 'Hola. Soy Strategic Copilot. ¿En qué te puedo ayudar hoy? Puedo analizar reportes, priorizar tareas o explicarte problemas técnicos.' }]); }}
              className={`flex-1 text-[10px] font-extrabold uppercase tracking-widest py-1.5 rounded-md transition-[color,background-color,box-shadow,border-color] border ${mode === 'copilot' ? 'bg-primary/15 text-foreground shadow-sm border-primary/25' : 'text-muted-fg hover:text-foreground/80 border-transparent'}`}
            >
              Copilot
            </button>
            <button
              onClick={() => { setMode('analyst'); setMessages([{ role: 'assistant', content: 'Analyst Mode activo. Listo para forense técnico, triage de alertas y revisión de postura.' }]); }}
              className={`flex-1 text-[10px] font-extrabold uppercase tracking-widest py-1.5 rounded-md transition-[color,background-color,box-shadow,border-color] border ${mode === 'analyst' ? 'bg-destructive/15 text-destructive shadow-sm border-destructive/25' : 'text-muted-fg hover:text-foreground/80 border-transparent'}`}
            >
              Analyst
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-background/40">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed font-semibold border-2 ${
              msg.role === 'user' 
                ? (mode === 'analyst' ? 'bg-destructive/30 text-foreground border-destructive/25 shadow-md' : 'bg-primary/30 text-foreground border-primary/25 shadow-md') 
                : 'bg-muted/25 text-foreground/80 border-border/60'
            }`}>
              <div dangerouslySetInnerHTML={{ __html: escapeHtml(msg.content).replace(/\n/g, '<br/>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted/15 border-2 border-border/50 rounded-xl px-4 py-3 flex items-center gap-2.5">
              <Loader2 className={`w-3.5 h-3.5 animate-spin ${mode === 'analyst' ? 'text-destructive' : 'text-primary'}`} />
              <span className="text-[9px] font-extrabold text-muted-fg uppercase tracking-widest animate-pulse">Generando...</span>
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
              className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-muted/25 hover:bg-muted/50 border-2 border-border/60 text-muted-fg hover:text-foreground px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
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
            placeholder={mode === 'analyst' ? "Comandos forenses o consultas de análisis..." : "Pregúntale al Copilot..."}
            className={`w-full bg-muted/50 border-2 border-border/60 focus:border-primary/50 rounded-xl px-4 py-3.5 pr-14 text-xs font-medium text-foreground placeholder:text-muted-fg outline-none resize-none max-h-32 transition-colors duration-300 focus:ring-2 focus:ring-primary/15`}
            rows={1}
            style={{ minHeight: '50px' }}
          />
          <button
            type="submit"
            aria-label="Enviar mensaje"
            disabled={!input.trim() || isLoading}
            className={`absolute right-2 top-2 p-2 rounded-lg text-foreground disabled:opacity-20 transition-[color,background-color,opacity,box-shadow,border-color] cursor-pointer shadow-md border-2 ${
              mode === 'analyst' 
                ? 'bg-destructive hover:bg-destructive/80 hover:shadow-[0_0_15px_rgba(200,50,55,0.3)] border-destructive/30 hover:border-destructive/50' 
                : 'bg-primary hover:bg-primary/80 hover:shadow-[0_0_15px_rgba(98,113,196,0.3)] border-primary/30 hover:border-primary/50'
            }`}
          >
            <Send aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </form>
        <p className="mt-3 text-[9px] font-extrabold text-center text-muted-fg uppercase tracking-widest">
          IA Experimental • Verificar datos con Analistas Humanos
        </p>
      </div>
    </div>
  );
}
