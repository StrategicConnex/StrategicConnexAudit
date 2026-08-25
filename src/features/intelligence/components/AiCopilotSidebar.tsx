"use client";

import React from "react";
import { Sparkles, ChevronRight, ArrowRight, Loader2 } from "lucide-react";
import type { ChatMessage } from "../hooks/useAiChat";

interface AiCopilotSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isGenerating: boolean;
  onRequestRemediation: () => void;
  hasActiveInvestigation: boolean;
  investigationStatus?: string;
}

export function AiCopilotSidebar({
  isOpen,
  onToggle,
  messages,
  inputValue,
  onInputChange,
  onSubmit,
  isGenerating,
  onRequestRemediation,
  hasActiveInvestigation,
  investigationStatus,
}: AiCopilotSidebarProps) {
  const canRequestPlan = hasActiveInvestigation &&
    investigationStatus !== "draft" &&
    investigationStatus !== undefined;

  return (
    <aside className={`relative border-l border-border bg-card shrink-0 h-full flex flex-col transition-[background-color,border-color,opacity] duration-300 ease-in-out ${
      isOpen ? "w-80 opacity-100" : "w-0 opacity-0 overflow-hidden border-l-0"
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-border bg-background flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-chartreuse animate-pulse" />
          <h3 className="text-xs font-semibold text-foreground tracking-wider uppercase font-mono">
            Asistente IA
          </h3>
        </div>
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-muted text-muted-fg hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Remediation Plan button */}
      {hasActiveInvestigation && (
        <div className="p-3 border-b border-border bg-background/40 shrink-0">
          <button
            onClick={onRequestRemediation}
            disabled={isGenerating || !canRequestPlan}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg border border-chartreuse/20 bg-chartreuse/10 text-chartreuse text-xs font-mono hover:bg-chartreuse/20 active:scale-98 transition-[color,background-color,border-color,opacity,transform] disabled:opacity-40 disabled:scale-100"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generando Plan...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generar Plan Copilot IA</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col space-y-1 p-3 rounded-xl text-xs max-w-[90%] transition-[color,background-color,margin] ${
              msg.role === "user"
                ? "bg-foreground text-background ml-auto border border-border"
                : "bg-muted border border-border text-foreground mr-auto"
            }`}
          >
            <span className="text-2xs font-mono font-medium tracking-wide uppercase opacity-60">
              {msg.role === "user" ? "Yo" : "Copilot Audit"}
            </span>
            <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          </div>
        ))}
      </div>

      {/* Input Box */}
      <form onSubmit={onSubmit} className="p-4 border-t border-border bg-background/50 shrink-0">
        <div className="relative flex items-center bg-muted border border-border rounded-xl p-1 focus-within:border-border">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Pregunta sobre puertos, SPF..."
            className="flex-1 bg-transparent border-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-lg text-xs text-foreground placeholder:text-muted-fg py-2.5 px-3"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-[color,background-color,opacity,transform]"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </aside>
  );
}
