"use client";

import { useState, useCallback } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface UseAiChatReturn {
  messages: ChatMessage[];
  isGenerating: boolean;
  sendMessage: (text: string) => void;
  requestRemediationPlan: (investigationId: string) => Promise<void>;
  clearChat: () => void;
  addAssistantMessage: (text: string) => void;
}

export function useAiChat(): UseAiChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Hola. Soy tu Asistente de Inteligencia de Red. Ingresa un objetivo o selecciona una herramienta para comenzar la auditoría." }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    const userText = text.trim();
    setMessages((prev) => [...prev, { role: "user", text: userText }]);

    // Simulate contextual response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `He analizado tu consulta sobre "${userText}". Bajo el alcance del proyecto actual, se recomienda ejecutar escaneos pasivos DNS y verificar la alineación SPF/DMARC para mitigar suplantaciones de identidad.`,
        },
      ]);
    }, 800);
  }, []);

  const requestRemediationPlan = useCallback(async (investigationId: string) => {
    if (!investigationId || isGenerating) return;
    setIsGenerating(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: "Genera el plan de remediación completo e interactivo para esta auditoría." },
    ]);

    try {
      const response = await fetch("/api/intelligence/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investigationId }),
      });
      const data = await response.json();
      if (data.success && data.remediationPlan) {
        setMessages((prev) => [...prev, { role: "assistant", text: data.remediationPlan }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `⚠️ No se pudo generar el plan: ${data.error || "Error desconocido"}` },
        ]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `⚠️ Error de conexión al generar el plan: ${errorMessage}` },
      ]);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating]);

  const clearChat = useCallback(() => {
    setMessages([
      { role: "assistant", text: "Hola. Soy tu Asistente de Inteligencia de Red. Ingresa un objetivo o selecciona una herramienta para comenzar la auditoría." },
    ]);
  }, []);

  const addAssistantMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: "assistant", text }]);
  }, []);

  return { messages, isGenerating, sendMessage, requestRemediationPlan, clearChat, addAssistantMessage };
}
