'use client';

import { useSyncExternalStore } from 'react';
import {
  getNotificationHistory,
  getUnreadCount,
  markAllRead,
  clearNotifications,
  subscribeToNotifications,
  type NotificationEntry,
} from '@/shared/lib/notify';

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
    markAllRead,
    clearNotifications,
  };
}

export type { NotificationEntry };
