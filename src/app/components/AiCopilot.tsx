'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Loader2, Minimize2, Maximize2, ShieldAlert, FileText, Activity } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type CopilotMode = 'copilot' | 'analyst';

export function AiCopilot({ contextData }: { contextData: unknown }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<CopilotMode>('copilot');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial message based on mode
  useEffect(() => {
    if (messages.length === 0) {
      if (mode === 'analyst') {
        setMessages([{ role: 'assistant', content: 'Analyst Mode activo. Listo para forense técnico, triage de alertas y revisión de postura.' }]);
      } else {
        setMessages([{ role: 'assistant', content: 'Hola. Soy Strategic Copilot. ¿En qué te puedo ayudar hoy? Puedo analizar reportes, priorizar tareas o explicarte problemas técnicos.' }]);
      }
    }
  }, [mode, messages.length]);

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
    }
  };

  const quickQuestions = mode === 'analyst' 
    ? ["Identificar vectores críticos", "Explicar drift reciente", "Resumir hallazgos"]
    : ["¿Qué debo priorizar?", "¿Cómo mejorar mi score?", "Generar plan de acción"];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 p-5 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] border border-cyan-500/20 hover:scale-105 hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] hover:border-cyan-400/40 transition-all duration-300 z-50 flex items-center justify-center group cursor-pointer"
      >
        <Sparkles className="w-5 h-5 animate-pulse text-cyan-200" strokeWidth={2.5} />
        <span className="max-w-0 overflow-hidden group-hover:max-w-[140px] transition-all duration-300 font-extrabold text-[11px] uppercase tracking-widest whitespace-nowrap px-0 group-hover:px-2 text-white">
          Strategic Copilot
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-8 right-8 glass-card border border-white/[0.06] shadow-2xl rounded-2xl flex flex-col z-50 transition-all duration-500 ease-in-out animate-in slide-in-from-bottom-10 fade-in ${isExpanded ? 'w-[700px] h-[85vh]' : 'w-[400px] h-[600px] max-h-[85vh]'}`}>
      {/* Header */}
      <div className="flex flex-col border-b border-white/[0.04] bg-[#08080c]/80 rounded-t-2xl shrink-0 backdrop-blur-xl">
        <div className="flex items-center justify-between p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${mode === 'analyst' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'}`}>
              {mode === 'analyst' ? <ShieldAlert className="w-4 h-4" strokeWidth={2.5} /> : <Sparkles className="w-4 h-4" strokeWidth={2.5} />}
            </div>
            <div>
              <h3 className="font-bold text-[14px] text-white tracking-tight">
                {mode === 'analyst' ? 'Analyst Mode' : 'Strategic Copilot'}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${mode === 'analyst' ? 'bg-rose-500' : 'bg-cyan-400'}`}></span>
                <span className={`text-[9px] font-extrabold uppercase tracking-widest ${mode === 'analyst' ? 'text-rose-400' : 'text-cyan-400'}`}>
                  Motor Activo
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsExpanded(!isExpanded)} 
              className="p-2 hover:bg-white/[0.04] rounded-lg text-zinc-400 hover:text-white transition-colors"
              title={isExpanded ? 'Colapsar' : 'Expandir'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Maximize2 className="w-3.5 h-3.5" strokeWidth={2.5} />}
            </button>
            <button 
              onClick={() => setIsOpen(false)} 
              className="p-2 hover:bg-white/[0.04] rounded-lg text-zinc-400 hover:text-white transition-colors"
              title="Cerrar"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="px-5 pb-3">
          <div className="bg-white/[0.02] border border-white/[0.04] p-1 rounded-lg flex items-center gap-1">
            <button
              onClick={() => { setMode('copilot'); setMessages([]); }}
              className={`flex-1 text-[10px] font-extrabold uppercase tracking-widest py-1.5 rounded-md transition-all ${mode === 'copilot' ? 'bg-white/[0.06] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Copilot
            </button>
            <button
              onClick={() => { setMode('analyst'); setMessages([]); }}
              className={`flex-1 text-[10px] font-extrabold uppercase tracking-widest py-1.5 rounded-md transition-all ${mode === 'analyst' ? 'bg-rose-500/10 text-rose-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Analyst
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-[#050508]/40">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed font-semibold border ${
              msg.role === 'user' 
                ? (mode === 'analyst' ? 'bg-rose-900/40 text-white border-rose-500/20 shadow-md' : 'bg-cyan-900/40 text-white border-cyan-500/20 shadow-md') 
                : 'bg-white/[0.03] text-zinc-200 border-white/[0.04]'
            }`}>
              <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3 flex items-center gap-2.5">
              <Loader2 className={`w-3.5 h-3.5 animate-spin ${mode === 'analyst' ? 'text-rose-400' : 'text-cyan-400'}`} />
              <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest animate-pulse">Generando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      {messages.length <= 2 && !isLoading && (
        <div className="px-5 py-3 border-t border-white/[0.04] flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
          {quickQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-400 hover:text-white px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5"
            >
              {mode === 'analyst' ? <Activity className="w-3 h-3 text-rose-500/50" /> : <FileText className="w-3 h-3 text-cyan-500/50" />}
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-5 border-t border-white/[0.04] shrink-0 bg-[#060608]">
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
            className={`w-full bg-[#08080a]/60 border border-white/[0.06] focus:border-white/[0.15] rounded-xl px-4 py-3.5 pr-14 text-xs font-medium text-white placeholder:text-zinc-500 outline-none resize-none max-h-32 transition-all duration-300 focus:shadow-[0_0_15px_rgba(255,255,255,0.03)]`}
            rows={1}
            style={{ minHeight: '50px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`absolute right-2 top-2 p-2 rounded-lg text-white disabled:opacity-20 transition-all cursor-pointer shadow-md ${
              mode === 'analyst' 
                ? 'bg-rose-600 hover:bg-rose-500 hover:shadow-[0_0_15px_rgba(225,29,72,0.3)]' 
                : 'bg-cyan-600 hover:bg-cyan-500 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]'
            }`}
          >
            <Send className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </form>
        <p className="mt-3 text-[9px] font-extrabold text-center text-zinc-600 uppercase tracking-widest">
          IA Experimental • Verificar datos con Analistas Humanos
        </p>
      </div>
    </div>
  );
}
