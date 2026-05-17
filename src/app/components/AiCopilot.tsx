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
        className="fixed bottom-8 right-8 p-5 rounded-full bg-gradient-to-r from-[#0a84ff] to-[#0055ff] text-white shadow-[0_0_30px_rgba(10,132,255,0.45)] border border-[#0a84ff]/30 hover:scale-105 hover:shadow-[0_0_40px_rgba(10,132,255,0.65)] hover:border-[#0a84ff]/60 transition-all duration-300 z-50 flex items-center justify-center group cursor-pointer"
      >
        <Sparkles className="w-6 h-6 animate-pulse" strokeWidth={2.5} />
        <span className="max-w-0 overflow-hidden group-hover:max-w-[120px] transition-all duration-300 font-bold text-[13px] tracking-tight whitespace-nowrap px-0 group-hover:px-2 text-white">
          SEO Copilot
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-8 right-8 glass-card border border-apple-gray-dark/10 shadow-2xl rounded-apple-md flex flex-col z-50 transition-all duration-500 ease-in-out animate-in slide-in-from-bottom-10 fade-in ${isExpanded ? 'w-[700px] h-[85vh]' : 'w-[400px] h-[640px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-apple-gray rounded-t-apple-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-apple-sm bg-apple-gray flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-apple-ink" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="font-bold text-[15px] text-apple-ink tracking-tight">Strategic Copilot</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">IA Activa</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-apple-gray rounded-apple-sm text-apple-ink/40 transition-colors">
            {isExpanded ? <Minimize2 className="w-4 h-4" strokeWidth={2.5} /> : <Maximize2 className="w-4 h-4" strokeWidth={2.5} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-apple-gray rounded-apple-sm text-apple-ink/40 transition-colors">
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-apple-sm px-5 py-3.5 text-[14px] leading-relaxed font-medium ${msg.role === 'user' ? 'bg-apple-blue text-white shadow-sm' : 'bg-apple-gray text-apple-ink'}`}>
              <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-apple-gray rounded-apple-sm px-5 py-4 flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-apple-ink/40" />
              <span className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">Generando Respuesta...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6 border-t border-apple-gray shrink-0">
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
            className="w-full bg-apple-gray border border-transparent focus:border-apple-gray-dark/10 rounded-apple-sm px-5 py-4 pr-14 text-[14px] font-medium text-apple-ink placeholder:text-apple-ink/30 outline-none resize-none max-h-32 transition-all"
            rows={1}
            style={{ minHeight: '56px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-3 top-3 p-2.5 rounded-apple-sm bg-apple-blue text-white shadow-md hover:bg-apple-blue/90 disabled:opacity-20 disabled:grayscale transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </form>
        <p className="mt-4 text-[10px] font-bold text-center text-apple-ink/20 uppercase tracking-widest">
          IA experimental • Verifique datos críticos
        </p>
      </div>
    </div>
  );
}
