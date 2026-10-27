/**
 * suggestion-state.ts — anti-nag en el navegador.
 *
 * El servidor decide si hay sugerencia; el cliente solo aplica frecuencia:
 *  - una exposición automática por contexto cada 24 h;
 *  - el descarte se guarda por fingerprint (hash de ids + ventana), así que
 *    un conjunto nuevo puede volver a mostrarse aunque el anterior se
 *    descartara.
 */

import type { ChatSuggestion } from "@/shared/types/chat";

export const SUGGESTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const DISMISS_PREFIX = "scaudit:chat:suggestion:dismissed:";
const SHOWN_PREFIX = "scaudit:chat:suggestion:shown:";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Fingerprint seguro para usar como clave (el servidor manda hex). */
function safeFingerprint(fingerprint: string): string | null {
  return /^[a-f0-9]{8,64}$/i.test(fingerprint) ? fingerprint : null;
}

export function suggestionDismissKey(fingerprint: string): string {
  return `${DISMISS_PREFIX}${fingerprint}`;
}

export function suggestionShownKey(contextId: string): string {
  return `${SHOWN_PREFIX}${contextId}`;
}

export function isSuggestionDismissed(fingerprint: string, storage: StorageLike): boolean {
  const safe = safeFingerprint(fingerprint);
  if (!safe) return true; // fingerprint inválido: no exponer nada
  return storage.getItem(suggestionDismissKey(safe)) === "1";
}

export function dismissSuggestion(fingerprint: string, storage: StorageLike): void {
  const safe = safeFingerprint(fingerprint);
  if (!safe) return;
  storage.setItem(suggestionDismissKey(safe), "1");
}

interface ShownRecord {
  fingerprint: string;
  at: number;
}

function readShown(contextId: string, storage: StorageLike): ShownRecord | null {
  const raw = storage.getItem(suggestionShownKey(contextId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ShownRecord>;
    if (typeof parsed.at !== "number" || typeof parsed.fingerprint !== "string") return null;
    return { fingerprint: parsed.fingerprint, at: parsed.at };
  } catch {
    return null;
  }
}

export function shouldShowSuggestion(input: {
  suggestion: ChatSuggestion | null;
  contextId: string;
  storage: StorageLike;
  now?: number;
}): boolean {
  const { suggestion, contextId, storage } = input;
  if (!suggestion) return false;
  if (isSuggestionDismissed(suggestion.fingerprint, storage)) return false;

  const shown = readShown(contextId, storage);
  if (!shown) return true;

  // Un conjunto nuevo puede mostrarse si el usuario descartó explícitamente el
  // anterior: el descarte es por fingerprint, no un silencio del contexto.
  if (
    shown.fingerprint !== suggestion.fingerprint &&
    storage.getItem(suggestionDismissKey(shown.fingerprint)) === "1"
  ) {
    return true;
  }

  const now = input.now ?? Date.now();
  return now - shown.at >= SUGGESTION_COOLDOWN_MS;
}

export function markSuggestionShown(
  suggestion: ChatSuggestion,
  contextId: string,
  storage: StorageLike,
  now: number = Date.now(),
): void {
  if (!safeFingerprint(suggestion.fingerprint)) return;
  storage.setItem(
    suggestionShownKey(contextId),
    JSON.stringify({ fingerprint: suggestion.fingerprint, at: now } satisfies ShownRecord),
  );
}
