/**
 * StrategicAudit Pro - Real User Monitoring (RUM) Script
 * 
 * Usage:
 * <script 
 *   src="https://your-domain.com/scripts/vitals.js" 
 *   data-project-id="YOUR_PROJECT_ID" 
 *   data-api-url="https://your-domain.com/api/telemetry/vitals" 
 *   defer>
 * </script>
 */

(function() {
  const scriptTag = document.currentScript;
  if (!scriptTag) return;

  const projectId = scriptTag.getAttribute('data-project-id');
  
  let defaultApiUrl = '/api/telemetry/vitals';
  try {
    if (scriptTag.src) {
      const scriptUrl = new URL(scriptTag.src, window.location.href);
      defaultApiUrl = scriptUrl.origin + '/api/telemetry/vitals';
    }
  } catch (e) {
    // Fallback if URL parsing fails
  }

  const apiUrl = scriptTag.getAttribute('data-api-url') || defaultApiUrl;

  if (!projectId) {
    console.warn('StrategicAudit Pro: data-project-id is missing.');
    return;
  }

  const metrics = {};
  
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const deviceType = isMobile ? 'mobile' : 'desktop';

  function sendMetrics() {
    if (Object.keys(metrics).length === 0) return;

    const payload = {
      projectId: projectId,
      url: window.location.href,
      deviceType: deviceType,
      metrics: metrics
    };

    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(apiUrl, blob);
    } else {
      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});
    }
  }

  function handleMetric(metric) {
    metrics[metric.name] = metric.value;
  }

  // Send metrics when page is unloaded or hidden
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendMetrics();
    }
  });

  window.addEventListener('pagehide', sendMetrics);

  // Dynamically load the web-vitals library
  const vitalsScript = document.createElement('script');
  vitalsScript.src = 'https://unpkg.com/web-vitals@3/dist/web-vitals.iife.js';
  vitalsScript.onload = function() {
    if (window.webVitals) {
      window.webVitals.onCLS(handleMetric);
      window.webVitals.onFID(handleMetric);
      window.webVitals.onLCP(handleMetric);
      window.webVitals.onFCP(handleMetric);
      window.webVitals.onTTFB(handleMetric);
      window.webVitals.onINP(handleMetric);
    }
  };
  document.head.appendChild(vitalsScript);
})();
