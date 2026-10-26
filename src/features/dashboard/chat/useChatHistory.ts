"use client";

import { useCallback } from "react";

/**
 * useChatHistory.ts — Historial de conversación del copilot en localStorage
 * (Sprint 1, semana 2; sin Supabase todavía — la sincronización server-side
 * llega en el Sprint 3).
 *
 * Decisiones:
 *   • Clave por modo (`scaudit:chat:copilot` / `:analyst`): cambiar de modo
 *     restaura la conversación de ese modo en vez de perderla.
 *   • TTL de 7 días: una conversación vieja no debe resucitar semanas después.
 *   • Tope de 100 mensajes: el payload enviado al endpoint acota el contexto
 *     y el localStorage no es un archivo.
 *   • Nunca se persisten mensajes de error ni respuestas a medio generar
 *     (isError / isStreaming): reintentar debe partir de un estado limpio.
 *   • Fallos de storage (cuota, modo privado) se tragan: el chat funciona
 *     igual, solo sin historial.
 */

const STORAGE_PREFIX = "scaudit:chat:";
const MAX_PERSISTED_MESSAGES = 100;
const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface PersistedChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface HistoryEnvelope {
  v: 1;
  savedAt: number;
  messages: PersistedChatMessage[];
}

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

/**
 * Carga el historial de `key`. Devuelve [] si no hay nada, está corrupto o
 * expiró (y en ese caso borra la entrada vencida).
 */
export function loadChatHistory(key: string): PersistedChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<HistoryEnvelope> | null;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.messages)) return [];
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > HISTORY_TTL_MS) {
      window.localStorage.removeItem(storageKey(key));
      return [];
    }
    return parsed.messages.filter(
      (m): m is PersistedChatMessage =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0,
    );
  } catch {
    return [];
  }
}

/**
 * Persiste la conversación. Filtra errores y respuestas en streaming; si no
 * queda nada significativo, borra la entrada en vez de guardar un saludo vacío.
 */
export function saveChatHistory(
  key: string,
  messages: Array<PersistedChatMessage & { isError?: boolean; isStreaming?: boolean }>,
): void {
  if (typeof window === "undefined") return;
  try {
    const persistable = messages
      .filter((m) => !m.isError && !m.isStreaming && typeof m.content === "string")
      .slice(-MAX_PERSISTED_MESSAGES)
      .map(({ role, content }) => ({ role, content }));

    // Solo la conversación con intercambios reales: un único mensaje del
    // asistente es el saludo de bienvenida, no historial.
    const hasConversation = persistable.some((m) => m.role === "user");
    if (!hasConversation) {
      window.localStorage.removeItem(storageKey(key));
      return;
    }

    const envelope: HistoryEnvelope = { v: 1, savedAt: Date.now(), messages: persistable };
    window.localStorage.setItem(storageKey(key), JSON.stringify(envelope));
  } catch {
    // Storage lleno o bloqueado: el chat sigue funcionando sin historial.
  }
}

/** Borra el historial de `key` (y solo ese). */
export function clearChatHistory(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    // Idem: sin historial no es un fallo del chat.
  }
}

/**
 * Atajo con claves ESTABLES para usar dentro de componentes: las funciones
 * no cambian entre renders con la misma `key`, así pueden figurar como
 * dependencia de useEffect sin disparar bucles de render.
 */
export function useChatHistory(key: string) {
  const load = useCallback(() => loadChatHistory(key), [key]);
  const save = useCallback(
    (
      messages: Array<PersistedChatMessage & { isError?: boolean; isStreaming?: boolean }>,
    ) => saveChatHistory(key, messages),
    [key],
  );
  const clear = useCallback(() => clearChatHistory(key), [key]);
  return { load, save, clear };
}
