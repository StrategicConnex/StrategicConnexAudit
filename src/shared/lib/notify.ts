'use client';

import { toast } from 'sonner';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT NotificationCenter — API de notificaciones in-app (Semana 10).

   Envuelve sonner con:
   - API tipada (success/error/info/warning/promise)
   - Historial de sesión en memoria (la campana del header lo muestra)
   - Pub/sub simple para que los suscriptores reaccionen a cambios

   El historial es solo de sesión (se pierde al recargar): honesto y sin
   backend nuevo. Los canales email/Telegram viven del digest semanal
   (runWeeklyDigest) y de project.settings.telegramChatId.
   ═══════════════════════════════════════════════════════════════════════ */

export type NotificationSeverity = 'success' | 'error' | 'info' | 'warning';

export interface NotificationEntry {
  id: string;
  severity: NotificationSeverity;
  message: string;
  description?: string;
  createdAt: number;
  read: boolean;
}

type Listener = () => void;

const MAX_HISTORY = 20;
const history: NotificationEntry[] = [];
const listeners = new Set<Listener>();

let seq = 0;

function emit() {
  for (const listener of listeners) listener();
}

function record(severity: NotificationSeverity, message: string, description?: string): NotificationEntry {
  const entry: NotificationEntry = {
    id: `n-${Date.now()}-${seq++}`,
    severity,
    message,
    description,
    createdAt: Date.now(),
    read: false,
  };
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  emit();
  return entry;
}

function show(severity: NotificationSeverity, message: string, description?: string) {
  const options = description ? { description } : undefined;
  switch (severity) {
    case 'success':
      toast.success(message, options);
      break;
    case 'error':
      toast.error(message, options);
      break;
    case 'warning':
      toast.warning(message, options);
      break;
    default:
      toast.info(message, options);
  }
  record(severity, message, description);
}

/**
 * API de notificaciones in-app. Cada método muestra el toast (sonner)
 * y lo registra en el historial de sesión para la campana del header.
 */
export const notify = {
  success: (message: string, description?: string) => show('success', message, description),
  error: (message: string, description?: string) => show('error', message, description),
  info: (message: string, description?: string) => show('info', message, description),
  warning: (message: string, description?: string) => show('warning', message, description),
  /** Delegación directa a sonner para promesas (loading → success/error). */
  promise: toast.promise,
  /** Descartar un toast activo por id de sonner. */
  dismiss: toast.dismiss,
};

/** Historial de sesión (más reciente primero). */
export function getNotificationHistory(): readonly NotificationEntry[] {
  return history;
}

/** Nº de notificaciones sin leer. */
export function getUnreadCount(): number {
  return history.filter((n) => !n.read).length;
}

/** Marca todas como leídas (al abrir la campana). */
export function markAllRead() {
  for (const entry of history) entry.read = true;
  emit();
}

/** Limpia el historial de sesión. */
export function clearNotifications() {
  history.length = 0;
  emit();
}

/** Suscripción a cambios del historial. Devuelve la función de cleanup. */
export function subscribeToNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
