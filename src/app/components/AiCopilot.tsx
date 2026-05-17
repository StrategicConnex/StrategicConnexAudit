'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, Loader2, Minimize2, Maximize2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AiCopilot({ contextData }: { contextData: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hola. Soy tu SEO Copilot. ¿En qué te puedo ayudar hoy? Puedo analizar tus métricas, priorizar tareas o explicarte problemas técnicos.' }
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          context: contextData
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, ocurrió un error de conexión.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 p-5 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-500/20 hover:scale-105 hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] hover:border-indigo-400/40 transition-all duration-300 z-50 flex items-center justify-center group cursor-pointer"
      >
        <Sparkles className="w-5 h-5 animate-pulse text-indigo-200" strokeWidth={2.5} />
        <span className="max-w-0 overflow-hidden group-hover:max-w-[120px] transition-all duration-300 font-extrabold text-[11px] uppercase tracking-widest whitespace-nowrap px-0 group-hover:px-2 text-white">
          SEO Copilot
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-8 right-8 glass-card border border-white/[0.06] shadow-2xl rounded-2xl flex flex-col z-50 transition-all duration-500 ease-in-out animate-in slide-in-from-bottom-10 fade-in ${isExpanded ? 'w-[700px] h-[85vh]' : 'w-[400px] h-[600px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/[0.04] bg-[#08080c]/40 rounded-t-2xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-indigo-400" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="font-bold text-[14px] text-white tracking-tight">Strategic Copilot</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[9px] font-extrabold text-[#06b6d4] uppercase tracking-widest">Motor Activo</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsExpanded(!isExpanded)} 
            className="p-2 hover:bg-white/[0.04] rounded-lg text-slate-400 hover:text-white transition-colors"
            title={isExpanded ? 'Colapsar' : 'Expandir'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Maximize2 className="w-3.5 h-3.5" strokeWidth={2.5} />}
          </button>
          <button 
            onClick={() => setIsOpen(false)} 
            className="p-2 hover:bg-white/[0.04] rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Cerrar"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed font-semibold border ${msg.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500/20 shadow-md' : 'bg-white/[0.03] text-slate-200 border-white/[0.04]'}`}>
              <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3 flex items-center gap-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#06b6d4]" />
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest animate-pulse">Generando Respuesta...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-5 border-t border-white/[0.04] shrink-0">
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
            placeholder="Pregúntale al Copilot..."
            className="w-full bg-[#08080a]/60 border border-white/[0.06] focus:border-[#06b6d4]/40 rounded-xl px-4 py-3.5 pr-14 text-xs font-semibold text-white placeholder:text-slate-500 outline-none resize-none max-h-32 transition-all duration-300"
            rows={1}
            style={{ minHeight: '50px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-20 transition-all cursor-pointer shadow-md hover:shadow-[0_0_15px_rgba(99,102,241,0.3)]"
          >
            <Send className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </form>
        <p className="mt-3 text-[9px] font-extrabold text-center text-slate-600 uppercase tracking-widest">
          IA experimental • Verifique datos críticos
        </p>
      </div>
    </div>
  );
}
