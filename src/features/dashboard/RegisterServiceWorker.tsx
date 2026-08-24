"use client";

import { useEffect } from 'react';

/**
 * RegisterServiceWorker — Registra el Service Worker al montar la app.
 * Se debe colocar en el layout raíz para cubrir todas las rutas.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] Registered:', reg.scope);

          // Solicitar permiso push si no fue denegado
          if ('PushManager' in window && Notification.permission === 'default') {
            // No solicitamos automáticamente, el usuario hace clic en PushSubscribeButton
          }
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });
    }
  }, []);

  return null; // No renderiza nada
}
