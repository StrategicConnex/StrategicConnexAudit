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
export function useNotificationCenter() {
  const history = useSyncExternalStore(subscribeToNotifications, getNotificationHistory);
  const unreadCount = useSyncExternalStore(subscribeToNotifications, getUnreadCount);

  return {
    history,
    unreadCount,
    markAllRead,
    clearNotifications,
  };
}

export type { NotificationEntry };
