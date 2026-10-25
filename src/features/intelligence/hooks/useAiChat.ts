"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";

export interface ChatAction {
  href: string;
  label: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
  action?: ChatAction;
}

export interface UseAiChatReturn {
  messages: ChatMessage[];
  isGenerating: boolean;
  sendMessage: (text: string) => Promise<void>;
  requestRemediationPlan: (investigationId: string) => Promise<void>;
  clearChat: () => void;
  addAssistantMessage: (text: string) => void;
}

export function useAiChat(): UseAiChatReturn {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: t("greeting") }]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Refs para que el payload incluya el historial completo aunque el callback
  // no se recree en cada render (y para bloquear envíos concurrentes).
  const messagesRef = useRef<ChatMessage[]>(messages);
  const generatingRef = useRef(false);

  const append = useCallback((message: ChatMessage) => {
    messagesRef.current = [...messagesRef.current, message];
    setMessages(messagesRef.current);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const userText = text.trim();
      if (!userText || generatingRef.current) return;

      generatingRef.current = true;
      setIsGenerating(true);
      append({ role: "user", text: userText });

      try {
        const response = await fetch("/api/ai/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "copilot",
            messages: messagesRef.current.map((m) => ({ role: m.role, content: m.text })),
          }),
        });

        const data = (await response.json().catch(() => null)) as {
          success?: boolean;
          message?: string;
          error?: string;
        } | null;

        if (!response.ok || !data?.success || typeof data.message !== "string") {
          throw new Error(
            data?.error || data?.message || t("httpError", { status: response.status })
          );
        }

        append({ role: "assistant", text: data.message });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        append({
          role: "assistant",
          text: t("errorUnavailable", { detail: errorMessage }),
          isError: true,
        });
      } finally {
        generatingRef.current = false;
        setIsGenerating(false);
      }
    },
    [append, t]
  );

  const requestRemediationPlan = useCallback(
    async (investigationId: string) => {
      if (!investigationId || generatingRef.current) return;

      generatingRef.current = true;
      setIsGenerating(true);
      append({ role: "user", text: t("remediationRequest") });

      try {
        const response = await fetch("/api/intelligence/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ investigationId }),
        });
        const data = (await response.json().catch(() => null)) as {
          success?: boolean;
          hasFindings?: boolean;
          remediationPlan?: string;
          error?: string;
          action?: { href?: unknown; label?: unknown };
        } | null;

        if (!response.ok || !data?.success || typeof data.remediationPlan !== "string") {
          append({
            role: "assistant",
            text: t("remediationError", { detail: data?.error || "Error desconocido" }),
            isError: true,
          });
        } else {
          // La acción solo tiene sentido cuando el backend confirma ausencia de
          // hallazgos: es un enlace real al escaneo, no un paso inventado.
          const action: ChatAction | undefined =
            data.hasFindings === false &&
            typeof data.action?.href === "string" &&
            typeof data.action?.label === "string"
              ? { href: data.action.href, label: data.action.label }
              : undefined;

          append({
            role: "assistant",
            text: data.remediationPlan,
            ...(action ? { action } : {}),
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        append({
          role: "assistant",
          text: t("remediationConnError", { detail: errorMessage }),
          isError: true,
        });
      } finally {
        generatingRef.current = false;
        setIsGenerating(false);
      }
    },
    [append, t]
  );

  const clearChat = useCallback(() => {
    messagesRef.current = [{ role: "assistant", text: t("greeting") }];
    setMessages(messagesRef.current);
  }, [t]);

  const addAssistantMessage = useCallback(
    (text: string) => {
      append({ role: "assistant", text });
    },
    [append]
  );

  return { messages, isGenerating, sendMessage, requestRemediationPlan, clearChat, addAssistantMessage };
}
