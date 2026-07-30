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

const CACHE_NAME = 'scaudit-pwa-v2';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/offline',
  '/manifest.json',
  '/logo-dark.svg',
  '/favicon.ico',
  '/favicon.svg',
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(() => {
      console.warn('[SW] Static precache incomplete, continuing...');
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Limpiar caches viejos cuando cambia CACHE_NAME
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
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

/**
 * Estrategia de cache para fetch requests.
 * - API calls (api/): network-first → fallback a cache
 * - Assets estáticos (svg, ico, json, fonts): cache-first → network
 * - Navegación (document): network-first → offline page
 * - Todo lo demás: network-only
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptar requests del mismo origen
  if (url.origin !== self.location.origin) {
    return;
  }

  // ── API calls: network-first ─────────────────────────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // ── Assets estáticos: cache-first ────────────────────────────────
  if (
    url.pathname.match(/\.(svg|ico|json|woff2?|ttf|png|jpg|webp)$/i) ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }

  // ── Navegación: network-first → offline page ─────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // ── Por defecto: network-only ────────────────────────────────────
  return;
});

/**
 * Network-first: intenta red, fallback a cache.
 * Útil para API calls donde queremos datos frescos pero toleramos stale.
 */
async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(
      JSON.stringify({ error: 'offline', message: 'Sin conexión a red' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Cache-first: busca en cache, fallback a red.
 * Ideal para assets que raramente cambian (SVG, iconos, JSON de configuración).
 */
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Actualizar cache en background (stale-while-revalidate implícito)
    fetch(request).then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 404 });
  }
}

/**
 * Network-first con fallback a offline page.
 * Para navegación: siempre intenta red, si falla muestra /offline.
 */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match('/offline');
    if (cached) {
      return cached;
    }
    // Fallback mínimo si /offline no está cacheado
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SCAUDIT — Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#060608;color:#a1a1aa;font-family:sans-serif;text-align:center;padding:2rem}div{max-width:400px}h1{color:white;font-size:1.75rem;margin-bottom:.5rem}p{font-size:.875rem;line-height:1.5}</style></head><body><div><h1>Sin Conexión</h1><p>Verificá tu conexión a internet y volvé a intentarlo.</p></div></body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }
}
