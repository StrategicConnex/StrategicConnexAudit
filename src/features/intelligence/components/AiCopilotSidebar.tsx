"use client";

import React from "react";
import { Sparkles, ChevronRight, ArrowRight, Loader2, Square, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChatMessage } from "../hooks/useAiChat";
import { ChatMessageBody } from "./ChatMessageBody";
import type { ChatSuggestion } from "@/shared/types/chat";

interface AiCopilotSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isGenerating: boolean;
  onStop: () => void;
  onClearHistory: () => void;
  onRequestRemediation: (investigationId?: string) => void;
  hasActiveInvestigation: boolean;
  investigationStatus?: string;
  suggestion: ChatSuggestion | null;
  onDismissSuggestion: () => void;
  onOpenReference?: (findingId: string) => void;
}

export function AiCopilotSidebar({
  isOpen,
  onToggle,
  messages,
  inputValue,
  onInputChange,
  onSubmit,
  isGenerating,
  onStop,
  onClearHistory,
  onRequestRemediation,
  hasActiveInvestigation,
  investigationStatus,
  suggestion,
  onDismissSuggestion,
  onOpenReference,
}: AiCopilotSidebarProps) {
  const t = useTranslations("chat");
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
            {t("sidebarTitle")}
          </h3>
        </div>
        <div className="flex items-center space-x-1">
          {messages.length > 1 && (
            <button
              type="button"
              onClick={onClearHistory}
              aria-label={t("clearHistory")}
              title={t("clearHistory")}
              className="p-1 rounded hover:bg-muted text-muted-fg hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onToggle}
            aria-label={t("hideAssistant")}
            className="p-1 rounded hover:bg-muted text-muted-fg hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Remediation Plan button */}
      {hasActiveInvestigation && (
        <div className="p-3 border-b border-border bg-background/40 shrink-0">
          <button
            onClick={() => onRequestRemediation()}
            disabled={isGenerating || !canRequestPlan}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg border border-chartreuse/20 bg-chartreuse/10 text-chartreuse text-xs font-mono hover:bg-chartreuse/20 active:scale-98 transition-[color,background-color,border-color,opacity,transform] disabled:opacity-40 disabled:scale-100"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t("generatingPlan")}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t("generatePlan")}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Chat History */}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={isGenerating}
        aria-label={t("sidebarLogAria")}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin"
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col space-y-1 p-3 rounded-xl text-xs max-w-[90%] transition-[color,background-color,margin] ${
              msg.role === "user"
                ? "bg-foreground text-background ml-auto border border-border"
                : msg.isError
                  ? "bg-destructive/10 border border-destructive/40 text-destructive mr-auto"
                  : "bg-muted border border-border text-foreground mr-auto"
            }`}
          >
            <span className="text-2xs font-mono font-medium tracking-wide uppercase opacity-60">
              {msg.role === "user" ? t("you") : t("copilotAudit")}
              {msg.interrupted && (
                <span className="ml-2 normal-case tracking-normal text-destructive">
                  {t("interrupted")}
                </span>
              )}
            </span>
            <ChatMessageBody
              text={msg.text}
              references={msg.references}
              unverifiedCount={msg.unverifiedCount}
              onOpenReference={onOpenReference}
            />
            {msg.streaming && (
              <span
                aria-hidden="true"
                className="inline-block h-3 w-1.5 animate-pulse rounded-sm bg-chartreuse align-middle"
              />
            )}
            {msg.action && (
              <a
                href={msg.action.href}
                className="mt-1 inline-flex items-center gap-1 text-2xs font-mono font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
              >
                {msg.action.label}
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </a>
            )}
          </div>
        ))}

        {suggestion && (
          <div
            role="status"
            className="rounded-xl border border-chartreuse/30 bg-chartreuse/5 p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs leading-relaxed text-foreground">{suggestion.text}</p>
              <button
                type="button"
                onClick={onDismissSuggestion}
                aria-label={t("dismissSuggestion")}
                className="p-0.5 rounded text-muted-fg hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onRequestRemediation(suggestion.investigationId ?? undefined)}
              disabled={isGenerating || !suggestion.investigationId}
              className="inline-flex items-center gap-1 text-2xs font-mono font-semibold text-primary hover:underline disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
            >
              {suggestion.ctaLabel}
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Input Box */}
      <form onSubmit={onSubmit} className="p-4 border-t border-border bg-background/50 shrink-0">
        <div className="relative flex items-center bg-muted border border-border rounded-xl p-1 focus-within:border-border">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            aria-label={t("askAria")}
            placeholder={t("askPlaceholder")}
            className="flex-1 bg-transparent border-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-lg text-xs text-foreground placeholder:text-muted-fg py-2.5 px-3"
          />
          {isGenerating ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t("stop")}
              title={t("stop")}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95 transition-[color,background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputValue.trim()}
              aria-label={t("sendAria")}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-95 disabled:opacity-30 disabled:scale-100 transition-[color,background-color,opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
