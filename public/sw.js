/**
 * sw.js — Service Worker para Notificaciones Push
 *
 * Estrategia:
 * - Escucha eventos 'push' con payload JSON
 * - Muestra notificaciones del sistema con ttulo, cuerpo, e cono
 * - Al hacer clic, abre /ai/health (o la URL especificada en la notificacin)
 *
 * Se registra desde el frontend via navigator.serviceWorker.register('/sw.js').
 * Compatible con Chrome, Firefox, Edge, Safari 16+.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

/**
 * Recibe un evento push y muestra una notificacin.
 * El payload es un JSON con:
 * {
 *   title: string,
 *   body: string,
 *   icon?: string,
 *   badge?: string,
 *   tag?: string,
 *   url?: string,
 *   data?: object
 * }
 */
self.addEventListener("push", (event) => {
  let data;

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    data = {
      title: "SCAUDIT Alert",
      body: event.data?.text() || "Notificacin de seguridad",
    };
  }

  if (!data || !data.title) {
    return;
  }

  const notificationTitle = data.title || "SCAUDIT";
  const notificationOptions = {
    body: data.body || "",
    icon: data.icon || "/favicon.ico",
    badge: data.badge || "/favicon.ico",
    tag: data.tag || "scaudit-alert",
    vibrate: [200, 100, 200],
    data: {
      url: data.url || "/ai/health",
      ...(data.data || {}),
      timestamp: Date.now(),
    },
    requireInteraction: true,
    actions: [
      {
        action: "open",
        title: "Abrir Dashboard",
      },
      {
        action: "dismiss",
        title: "Descartar",
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

/**
 * Maneja el click en la notificacin.
 * Accin "open" abre /ai/health (o la URL de la notificacin).
 * Accin "dismiss" slo cierra la notificacin.
 * Click sin accin abre /ai/health.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/ai/health";

  if (event.action === "dismiss") {
    return;
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
