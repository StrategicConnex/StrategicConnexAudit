"use client";

import { redactSensitiveText } from "@/shared/lib/redact-sensitive";

/**
 * Memoria local del chat de Intelligence — esquema v2.
 *
 * Decisiones (Sprint 2, C2):
 *   • Namespace y versión nuevos: `scaudit:chat:intelligence:v2:<mode>:<contextId>`.
 *     Las claves v1 (`scaudit:chat:copilot` / `:analyst`) no se leen, no se
 *     migran y no se borran desde aquí.
 *   • Aislamiento por modo y contexto activo: cambiar de investigación no
 *     mezcla conversaciones.
 *   • TTL de 7 días y tope persistido de 100 mensajes (el máximo que ya
 *     soporta el helper local del panel flotante).
 *   • El contexto saliente se recorta a 10 mensajes / 8.000 caracteres desde
 *     el más antiguo (FIFO) y se redacta con el scrubber compartido.
 *   • Nunca se persisten errores ni streams parciales.
 */

const STORAGE_PREFIX = "scaudit:chat:intelligence:v2";
const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PERSISTED_MESSAGES = 100;

export const MAX_CONTEXT_MESSAGES = 10;
export const MAX_CONTEXT_CHARS = 8_000;

export interface IntelligenceMemoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface IntelligenceMemoryContext {
  mode: string;
  projectId?: string | null;
  investigationId?: string | null;
}

export interface OutgoingHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

type PersistableMessage = IntelligenceMemoryMessage & {
  isError?: boolean;
  isStreaming?: boolean;
};

interface MemoryEnvelope {
  v: 2;
  savedAt: number;
  messages: IntelligenceMemoryMessage[];
}

/** Clave estable: investigación > proyecto > contexto vacío. */
export function buildIntelligenceMemoryKey(context: IntelligenceMemoryContext): string {
  const contextId = context.investigationId || context.projectId || "none";
  return `${STORAGE_PREFIX}:${context.mode}:${contextId}`;
}

function loadEnvelope(key: string): MemoryEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MemoryEnvelope> | null;
    if (!parsed || parsed.v !== 2 || !Array.isArray(parsed.messages)) return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > HISTORY_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { v: 2, savedAt: parsed.savedAt, messages: parsed.messages };
  } catch {
    return null;
  }
}

/**
 * Carga la conversación de `key`. Devuelve [] si no hay nada, está corrupta,
 * es de otra versión o expiró (en ese caso borra la entrada vencida).
 */
export function loadIntelligenceMemory(key: string): IntelligenceMemoryMessage[] {
  const envelope = loadEnvelope(key);
  if (!envelope) return [];
  return envelope.messages.filter(
    (m): m is IntelligenceMemoryMessage =>
      !!m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length > 0,
  );
}

/**
 * Persiste la conversación bajo `key`. Filtra errores/parciales, conserva los
 * 100 mensajes más recientes y borra la entrada si no hay intercambio real.
 */
export function saveIntelligenceMemory(
  key: string,
  messages: PersistableMessage[],
): void {
  if (typeof window === "undefined") return;
  try {
    const persistable = messages
      .filter(
        (m) =>
          !m.isError &&
          !m.isStreaming &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-MAX_PERSISTED_MESSAGES)
      .map(({ role, content }) => ({ role, content }));

    if (!persistable.some((m) => m.role === "user")) {
      window.localStorage.removeItem(key);
      return;
    }

    const envelope: MemoryEnvelope = { v: 2, savedAt: Date.now(), messages: persistable };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Storage lleno o bloqueado: el chat funciona sin memoria.
  }
}

/** Borra solo la conversación de `key`; nunca toca claves v1 ni otros contextos. */
export function clearIntelligenceMemory(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Idem: sin memoria no es un fallo del chat.
  }
}

/**
 * Construye el historial saliente: descarta errores/parciales, redacta el
 * contenido y recorta desde el mensaje más antiguo hasta cumplir ambos
 * presupuestos (cantidad y caracteres). El mensaje más reciente siempre se
 * conserva (truncado si él solo excede el presupuesto).
 */
export function buildOutgoingHistory(
  messages: PersistableMessage[],
  limits: { maxMessages?: number; maxChars?: number } = {},
): OutgoingHistoryMessage[] {
  const maxMessages = limits.maxMessages ?? MAX_CONTEXT_MESSAGES;
  const maxChars = limits.maxChars ?? MAX_CONTEXT_CHARS;

  const scrubbed = messages
    .filter(
      (m) =>
        !m.isError &&
        !m.isStreaming &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: redactSensitiveText(m.content) }));

  const selected: OutgoingHistoryMessage[] = [];
  let chars = 0;

  for (let i = scrubbed.length - 1; i >= 0 && selected.length < maxMessages; i--) {
    const message = scrubbed[i];
    if (!message) continue;
    const remaining = maxChars - chars;
    if (remaining <= 0) break;

    if (message.content.length > remaining) {
      selected.unshift({ role: message.role, content: message.content.slice(0, remaining) });
      break;
    }

    selected.unshift(message);
    chars += message.content.length;
  }

  return selected;
}
