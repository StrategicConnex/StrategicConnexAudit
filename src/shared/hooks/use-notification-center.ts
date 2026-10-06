'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getNotificationHistory,
  getUnreadCount,
  markAllRead,
  clearNotifications,
  subscribeToNotifications,
  mergeServerNotifications,
  type NotificationEntry,
  type NotificationSeverity,
} from '@/shared/lib/notify';

interface ServerNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string | null;
}

/** La gravedad visual se deriva del tipo de evento persistido. */
function severityForKind(kind: string): NotificationSeverity {
  if (kind === 'finding_overdue' || kind === 'integration_error') return 'warning';
  if (kind === 'scan_failed') return 'error';
  if (kind === 'audit_completed') return 'success';
  return 'info';
}

/**
 * Hook del NotificationCenter (Semana 10).
 * Expone el historial de sesión con subscribe/unsubscribe externo,
 * el contador sin leer y las acciones de la campana.
 */
/**
 * Snapshots para SSR. El store de notificaciones es memoria del módulo
 * (array de historial), así que en el servidor siempre parte de vacío.
 * `getNotificationHistory` devuelve la MISMA referencia de array en el
 * servidor, por lo que sirve como getServerSnapshot estable; el contador es
 * un primitivo. Sin estos argumentos React lanza
 * "Missing getServerSnapshot, which is required for server-rendered content"
 * y degrada toda la página a render en cliente.
 */
const getServerHistory = () => getNotificationHistory();
const getServerUnreadCount = () => getUnreadCount();

export function useNotificationCenter() {
  // Hidrata la bandeja persistente (B3) una vez al montar. Si el endpoint no
  // responde (SSR, jsdom, 401) se ignora: la campana sigue con la sesión.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/notifications?limit=50', {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const rows: ServerNotification[] = Array.isArray(data?.notifications)
          ? data.notifications
          : [];
        if (!active || rows.length === 0) return;
        mergeServerNotifications(
          rows.map((n) => ({
            id: `srv-${n.id}`,
            severity: severityForKind(n.kind),
            message: n.title,
            description: n.body,
            createdAt: n.createdAt ? Date.parse(n.createdAt) : Date.now(),
            read: n.readAt != null,
          })),
        );
      } catch {
        /* sin bandeja persistente: la campana sigue mostrando la sesión */
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const markAllReadEverywhere = () => {
    markAllRead();
    // Persiste el "todo leído" para que no vuelva a aparecer al recargar.
    void fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
  };

  const history = useSyncExternalStore(
    subscribeToNotifications,
    getNotificationHistory,
    getServerHistory,
  );
  const unreadCount = useSyncExternalStore(
    subscribeToNotifications,
    getUnreadCount,
    getServerUnreadCount,
  );

  return {
    history,
    unreadCount,
    markAllRead: markAllReadEverywhere,
    clearNotifications,
  };
}

export type { NotificationEntry };
