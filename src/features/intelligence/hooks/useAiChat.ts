"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { parseChatCommand } from "../lib/chat-commands";
import {
  buildIntelligenceMemoryKey,
  buildOutgoingHistory,
  clearIntelligenceMemory,
  loadIntelligenceMemory,
  saveIntelligenceMemory,
} from "../lib/chat-memory";

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

export interface IntelligenceChatContext {
  projectId?: string;
  investigationId?: string | null;
}

const MEMORY_MODE = "analyst";

export function useAiChat(context: IntelligenceChatContext = {}): UseAiChatReturn {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: t("greeting") },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Refs para que el payload incluya el historial completo aunque el callback
  // no se recree en cada render (y para bloquear envíos concurrentes).
  const messagesRef = useRef<ChatMessage[]>(messages);
  const generatingRef = useRef(false);

  const memoryKey = buildIntelligenceMemoryKey({
    mode: MEMORY_MODE,
    projectId: context.projectId,
    investigationId: context.investigationId,
  });
  const hydratedKeyRef = useRef<string | null>(null);
  const lastPersistedRef = useRef<string>("[]");

  const setAll = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const append = useCallback(
    (message: ChatMessage) => {
      setAll([...messagesRef.current, message]);
    },
    [setAll],
  );

  // Hidratación por contexto: al cambiar de investigación se carga solo su
  // conversación. El saludo sintético no se persiste (índice 0).
  useEffect(() => {
    if (hydratedKeyRef.current === memoryKey) return;
    hydratedKeyRef.current = memoryKey;

    const stored = loadIntelligenceMemory(memoryKey);
    lastPersistedRef.current = JSON.stringify(stored);
    setAll([
      { role: "assistant", text: t("greeting") },
      ...stored.map((m) => ({ role: m.role, text: m.content })),
    ]);
  }, [memoryKey, setAll, t]);

  // Persistencia: solo mensajes completados, excluyendo errores. Se compara
  // con lo último guardado para no reescribir en cada render.
  useEffect(() => {
    if (hydratedKeyRef.current !== memoryKey) return;

    const persistable = messagesRef.current
      .slice(1)
      .map((m) => ({ role: m.role, content: m.text, isError: m.isError }));

    const serialized = JSON.stringify(persistable);
    if (serialized === lastPersistedRef.current) return;

    saveIntelligenceMemory(memoryKey, persistable);
    lastPersistedRef.current = serialized;
  }, [messages, memoryKey]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userText = text.trim();
      if (!userText || generatingRef.current) return;

      append({ role: "user", text: userText });

      const command = parseChatCommand(userText);
      if (command?.kind === "help") {
        append({ role: "assistant", text: t("commandHelp") });
        return;
      }
      if (command?.kind === "unknown") {
        append({
          role: "assistant",
          text: t("commandUnknown", { command: command.command }),
        });
        return;
      }
      if (command?.kind === "finding" && !command.findingId) {
        append({ role: "assistant", text: t("commandFindingUsage") });
        return;
      }

      const findingId = command?.kind === "finding" ? command.findingId : undefined;

      generatingRef.current = true;
      setIsGenerating(true);

      try {
        // Solo los IDs viajan como contexto; el historial sale recortado y
        // redactado (10 mensajes / 8.000 caracteres).
        const history = buildOutgoingHistory(
          messagesRef.current.slice(1).map((m) => ({
            role: m.role,
            content: m.text,
            isError: m.isError,
          })),
        );

        const response = await fetch("/api/ai/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: MEMORY_MODE,
            intelligenceContext: {
              ...(context.projectId ? { projectId: context.projectId } : {}),
              ...(context.investigationId ? { investigationId: context.investigationId } : {}),
              ...(findingId ? { findingId } : {}),
            },
            messages: history,
          }),
        });

        const data = (await response.json().catch(() => null)) as {
          success?: boolean;
          message?: string;
          error?: string;
        } | null;

        if (!response.ok || !data?.success || typeof data.message !== "string") {
          const detail =
            findingId && response.status === 404
              ? t("commandFindingUnavailable")
              : data?.error || data?.message || t("httpError", { status: response.status });
          throw new Error(detail);
        }

        append({ role: "assistant", text: data.message });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const findingUnavailable =
          findingId !== undefined && errorMessage === t("commandFindingUnavailable");
        append({
          role: "assistant",
          text: findingUnavailable
            ? errorMessage
            : t("errorUnavailable", { detail: errorMessage }),
          isError: true,
        });
      } finally {
        generatingRef.current = false;
        setIsGenerating(false);
      }
    },
    [
      append,
      context.projectId,
      context.investigationId,
      t,
    ]
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
    clearIntelligenceMemory(memoryKey);
    lastPersistedRef.current = "[]";
    setAll([{ role: "assistant", text: t("greeting") }]);
  }, [memoryKey, setAll, t]);

  const addAssistantMessage = useCallback(
    (text: string) => {
      append({ role: "assistant", text });
    },
    [append]
  );

  return {
    messages,
    isGenerating,
    sendMessage,
    requestRemediationPlan,
    clearChat,
    addAssistantMessage,
  };
}
