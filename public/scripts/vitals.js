/**
 * StrategicAudit Pro — Real User Monitoring (RUM) v2.0
 * Mejoras: session tracking, SPA navigation, error tracking, batching, retry, sampling
 *
 * Uso:
 * <script
 *   src="https://scaudit.vercel.app/scripts/vitals.js"
 *   data-project-id="PROYECTO_ID"
 *   data-api-url="https://scaudit.vercel.app/api/telemetry/vitals"
 *   data-sampling="1.0"
 *   data-spa-tracking="true"
 *   defer>
 * </script>
 */
(function () {
  'use strict';

  /* ===================== CONFIG ===================== */
  const script = document.currentScript;
  if (!script) return;

  const PROJECT_ID = script.getAttribute('data-project-id');
  const API_URL = script.getAttribute('data-api-url') || deriveApiUrl();
  const SAMPLING_RATE = parseFloat(script.getAttribute('data-sampling') || '1.0');
  const ENABLE_SPA = script.getAttribute('data-spa-tracking') !== 'false';
  const BATCH_SIZE = parseInt(script.getAttribute('data-batch-size') || '10', 10);
  const FLUSH_INTERVAL = parseInt(script.getAttribute('data-flush-interval') || '15000', 10); // ms

  if (!PROJECT_ID) {
    console.warn('[SA-RUM] data-project-id es obligatorio.');
    return;
  }

  // Sampling: solo % de usuarios envía métricas (1.0 = 100%)
  if (Math.random() > SAMPLING_RATE) return;

  /* ===================== STATE ===================== */
  const sessionId = getOrCreateSessionId();
  const sessionStart = Date.now();
  let pageStart = Date.now();
  let pageViews = 0;
  let currentUrl = location.href;
  let currentPath = location.pathname + location.search;
  let lastSent = Date.now();
  let buffer = []; // Cola de eventos antes de enviar
  let isUnloading = false;
  let vitals = {}; // Web Vitals acumulados
  let errors = []; // Errores JS capturados
  let interactions = []; // Interacciones para INP/contexto
  let resources = []; // Performance entries críticos

  /* ===================== UTILS ===================== */
  function deriveApiUrl() {
    try {
      const u = new URL(script.src, location.href);
      return u.origin + '/api/telemetry/vitals';
    } catch (e) {
      return '/api/telemetry/vitals';
    }
  }

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getOrCreateSessionId() {
    try {
      const existing = sessionStorage.getItem('sa_session_id');
      if (existing) return existing;
      const id = generateId();
      sessionStorage.setItem('sa_session_id', id);
      return id;
    } catch (e) {
      return generateId();
    }
  }

  function getDeviceInfo() {
    const ua = navigator.userAgent;
    const platform = navigator.platform || 'unknown';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua);
    const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

    // Parsear browser básico sin enviar UA completo (privacidad)
    let browser = 'unknown';
    let browserVersion = '';
    if (ua.includes('Firefox/')) { browser = 'Firefox'; browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1]; }
    else if (ua.includes('Edg/')) { browser = 'Edge'; browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1]; }
    else if (ua.includes('Chrome/') && !ua.includes('Edg/')) { browser = 'Chrome'; browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1]; }
    else if (ua.includes('Safari/') && !ua.includes('Chrome')) { browser = 'Safari'; browserVersion = ua.match(/Version\/([\d.]+)/)?.[1]; }

    return {
      deviceType,
      platform,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      dpr: window.devicePixelRatio || 1,
      language: navigator.language || 'unknown',
      browser,
      browserVersion: browserVersion || '',
    };
  }

  function getConnectionInfo() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return null;
    return {
      effectiveType: c.effectiveType,   // 4g, 3g, 2g
      downlink: c.downlink,           // Mbps estimado
      rtt: c.rtt,                     // Round-trip time ms
      saveData: c.saveData || false,
    };
  }

  function getMemoryInfo() {
    // Chrome-only
    const m = performance.memory;
    if (!m) return null;
    return {
      usedJSHeapSize: m.usedJSHeapSize,
      totalJSHeapSize: m.totalJSHeapSize,
      jsHeapSizeLimit: m.jsHeapSizeLimit,
    };
  }

  function getNavigationTiming() {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (!nav) return null;
    return {
      dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
      tcp: Math.round(nav.connectEnd - nav.connectStart),
      ssl: nav.secureConnectionStart > 0 ? Math.round(nav.connectEnd - nav.secureConnectionStart) : 0,
      ttfb: Math.round(nav.responseStart - nav.startTime),
      download: Math.round(nav.responseEnd - nav.responseStart),
      domInteractive: Math.round(nav.domInteractive - nav.startTime),
      domComplete: Math.round(nav.domComplete - nav.startTime),
    };
  }

  function getResourceHints() {
    // Solo recursos críticos (LCP candidates, scripts CSS)
    const all = performance.getEntriesByType && performance.getEntriesByType('resource') || [];
    const critical = all
      .filter(r => {
        const isImage = r.initiatorType === 'img' || (r.responseEnd - r.startTime) > 500;
        const isScript = r.initiatorType === 'script';
        const isCss = r.initiatorType === 'link' || r.initiatorType === 'css';
        return (isImage || isScript || isCss) && (r.responseEnd - r.startTime) > 100;
      })
      .slice(0, 10) // Limitar a 10 para no saturar payload
      .map(r => ({
        name: r.name.split('?')[0], // Sin query params (privacidad)
        type: r.initiatorType,
        duration: Math.round(r.responseEnd - r.startTime),
        size: r.transferSize || 0,
      }));
    return critical;
  }

  function now() {
    return Math.round(performance.now());
  }

  /* ===================== BUFFER / QUEUE ===================== */
  function enqueue(type, data) {
    buffer.push({
      type,
      data,
      ts: Date.now(),
    });
    if (buffer.length >= BATCH_SIZE) {
      flush();
    }
  }

  /* ===================== FLUSH / SEND ===================== */
  function buildPayload(isFinal = false) {
    const device = getDeviceInfo();
    const timing = getNavigationTiming();
    const connection = getConnectionInfo();
    const memory = getMemoryInfo();

    return {
      projectId: PROJECT_ID,
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      url: currentUrl,
      path: currentPath,
      referrer: document.referrer || '',
      device: device,
      connection: connection,
      memory: memory,
      timing: timing,
      vitals: vitals,
      pageViews: pageViews,
      sessionDuration: Date.now() - sessionStart,
      timeOnPage: Date.now() - pageStart,
      errors: errors.splice(0, 10), // Consumir array
      interactions: interactions.splice(0, 20),
      resources: resources.length ? resources.splice(0, 10) : getResourceHints(),
      isFinal: isFinal,
    };
  }

  function flush(isFinal = false) {
    if (buffer.length === 0 && !isFinal && Object.keys(vitals).length === 0) return;

    const payload = buildPayload(isFinal);
    // Añadir eventos en buffer como "events"
    payload.events = buffer.splice(0, buffer.length);

    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: 'application/json' });

    if (isFinal && navigator.sendBeacon) {
      navigator.sendBeacon(API_URL, blob);
    } else {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(() => {
        // Fallback: guardar en localStorage para retry
        saveForRetry(payload);
      });
    }
  }

  function saveForRetry(payload) {
    try {
      const queue = JSON.parse(localStorage.getItem('sa_rum_retry') || '[]');
      queue.push({ payload, ts: Date.now() });
      if (queue.length > 20) queue.shift(); // Evitar crecimiento infinito
      localStorage.setItem('sa_rum_retry', JSON.stringify(queue));
    } catch (e) {}
  }

  function sendRetryQueue() {
    try {
      const queue = JSON.parse(localStorage.getItem('sa_rum_retry') || '[]');
      if (!queue.length) return;
      localStorage.removeItem('sa_rum_retry');

      queue.forEach(item => {
        fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
          keepalive: true,
        }).catch(() => {});
      });
    } catch (e) {}
  }

  /* ===================== WEB VITALS ===================== */
  function loadWebVitals(callback) {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/web-vitals@3/dist/web-vitals.iife.js';
    s.onload = function () {
      if (window.webVitals) {
        window.webVitals.onCLS(v => { vitals.cls = v.value; vitals.clsRating = v.rating; });
        window.webVitals.onLCP(v => { vitals.lcp = v.value; vitals.lcpRating = v.rating; vitals.lcpElement = v.entries?.[0]?.element?.nodeName; });
        window.webVitals.onINP(v => { vitals.inp = v.value; vitals.inpRating = v.rating; });
        window.webVitals.onFID(v => { vitals.fid = v.value; vitals.fidRating = v.rating; });
        window.webVitals.onFCP(v => { vitals.fcp = v.value; vitals.fcpRating = v.rating; });
        window.webVitals.onTTFB(v => { vitals.ttfb = v.value; vitals.ttfbRating = v.rating; });
        if (callback) callback();
      }
    };
    s.onerror = function () { console.warn('[SA-RUM] No se pudo cargar web-vitals.'); };
    document.head.appendChild(s);
  }

  /* ===================== ERROR TRACKING ===================== */
  function installErrorTracking() {
    window.addEventListener('error', function (e) {
      errors.push({
        type: 'js',
        message: e.message,
        filename: (e.filename || '').split('?')[0],
        lineno: e.lineno,
        colno: e.colno,
        ts: Date.now(),
      });
      if (errors.length > 20) errors.shift();
    });

    window.addEventListener('unhandledrejection', function (e) {
      errors.push({
        type: 'promise',
        message: e.reason && e.reason.message ? e.reason.message : String(e.reason),
        ts: Date.now(),
      });
      if (errors.length > 20) errors.shift();
    });
  }

  /* ===================== INTERACTION TRACKING ===================== */
  function installInteractionTracking() {
    // Capturar clicks en elementos clave (botones, links, inputs)
    document.addEventListener('click', function (e) {
      const el = e.target.closest('a, button, [role="button"], input[type="submit"]');
      if (!el) return;
      interactions.push({
        type: 'click',
        tag: el.tagName,
        id: el.id || '',
        class: (el.className || '').toString().split(' ').slice(0, 3).join(' '),
        text: (el.textContent || '').trim().substring(0, 50),
        ts: Date.now(),
      });
      if (interactions.length > 50) interactions.shift();
    }, true);
  }

  /* ===================== SPA NAVIGATION ===================== */
  function installSpaTracking() {
    if (!ENABLE_SPA) return;

    // Enviar métricas de página actual antes de navegar
    function onNavigate() {
      if (location.href === currentUrl) return;
      flush(true); // Enviar acumulado de la página anterior

      // Resetear contadores de página
      pageStart = Date.now();
      currentUrl = location.href;
      currentPath = location.pathname + location.search;
      vitals = {}; // Resetear vitals por página
      pageViews++;
      errors = [];
      interactions = [];
      resources = [];
    }

    // Interceptar pushState/replaceState
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;

    history.pushState = function () {
      originalPush.apply(this, arguments);
      onNavigate();
    };
    history.replaceState = function () {
      originalReplace.apply(this, arguments);
      onNavigate();
    };

    window.addEventListener('popstate', onNavigate);
  }

  /* ===================== LIFECYCLE ===================== */
  function installLifecycle() {
    // Enviar periódicamente (cada 15s o BATCH_SIZE)
    const interval = setInterval(() => flush(false), FLUSH_INTERVAL);

    // Enviar al cambiar de pestaña
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        flush(true);
      } else {
        // Volver a visible: intentar enviar retry queue
        sendRetryQueue();
      }
    });

    // Enviar al cerrar/navegar
    window.addEventListener('pagehide', function () {
      isUnloading = true;
      flush(true);
      clearInterval(interval);
    });

    // Antes de unload (fallback)
    window.addEventListener('beforeunload', function () {
      flush(true);
    });
  }

  /* ===================== INIT ===================== */
  function init() {
    pageViews = 1;

    loadWebVitals(function () {
      // Web vitals listo
    });

    installErrorTracking();
    installInteractionTracking();
    installSpaTracking();
    installLifecycle();

    // Enviar heartbeat inicial
    enqueue('pageview', { url: currentUrl, referrer: document.referrer });
    setTimeout(() => flush(false), 1000);

    // Retry queue al cargar
    sendRetryQueue();

    console.log('[SA-RUM] StrategicAudit RUM activo. Session:', sessionId);
  }

  // Esperar a que el DOM esté listo si es necesario
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
