---
layout: default
title: API Reference
nav_order: 3
permalink: /docs/api
---

# API Reference

{: .no_toc }

<details open markdown="block">
  <summary>Tabla de contenidos</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

La API de SCAUDIT Pro está organizada por dominio funcional. Todos los endpoints que requieren autenticación usan **Supabase Auth** con sesión manejada vía cookies.

## AI & Copilot

### `POST /api/ai/copilot`

Chat con el AI Copilot de infraestructura para obtener planes de remediación técnica.

**Request body:**
```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "context": { "target": "example.com" },
  "mode": "analyst"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Análisis detallado...",
  "modelUsed": "openrouter/free",
  "fromCache": false
}
```

Autenticación: Requiere sesión activa · Rate limit: 5 req/60s

### `POST /api/ai/report`

Genera un reporte SEO ejecutivo con datos de GSC y GA4.

**Request body:**
```json
{
  "projectId": "uuid",
  "month": "2026-07",
  "includeRecommendations": true
}
```

**Response:**
```json
{
  "success": true,
  "report": "Reporte en Markdown...",
  "isFallback": false,
  "modelUsed": "google/gemma-4-26b-a4b-it:free"
}
```

### `GET /api/ai/healthcheck`

Health check periódico de todos los modelos de IA configurados.

**Response:**
```json
{
  "overallStatus": "healthy",
  "modelsHealthy": 4,
  "modelsFailed": 0,
  "avgLatencyMs": 420,
  "modelResults": [...]
}
```

Autenticación: Protegido con `CRON_SECRET`

---

## Inteligencia Cibernética

### `GET /api/intelligence`

Lista investigaciones de inteligencia activas.

**Query params:** `projectId`, `status`, `limit`, `offset`

### `POST /api/intelligence`

Crea una nueva investigación.

**Request body:**
```json
{
  "projectId": "uuid",
  "target": "example.com",
  "targetType": "domain",
  "tools": ["dns.lookup", "dns.mx", "whois", "ssl.cert"]
}
```

### `POST /api/intelligence/copilot`

Genera un plan de remediación técnica para hallazgos de seguridad.

**Request body:**
```json
{
  "investigationId": "uuid"
}
```

### `POST /api/intelligence/brief`

Genera un Incident Brief ejecutivo tipo C-suite.

**Request body:**
```json
{
  "investigationId": "uuid"
}
```

### `POST /api/intelligence/runs`

Ejecuta herramientas de inteligencia sobre un objetivo.

**Request body:**
```json
{
  "investigationId": "uuid",
  "tools": ["dns.lookup", "geoip", "ssl.cert"]
}
```

### `GET /api/intelligence/health`

Estado del engine de inteligencia (servicios upstream, caché, rate limiters).

### `GET /api/intelligence/drift`

Análisis de cambios en la postura de seguridad a lo largo del tiempo.

### `GET /api/intelligence/assets/graph`

Graph de relaciones entre activos descubiertos (subdominios, IPs, certificados).

**Response:** Objeto con nodos y aristas para visualización con React Flow.

---

## Seguridad

### `GET /api/security/audit-logs`

Obtiene logs de auditoría con paginación y filtros.

**Query params:** `eventType`, `ip`, `from`, `to`, `limit`, `offset`

### `POST /api/security/csp-report`

Endpoint de reporte de violaciones CSP. Recibe informes de `report-uri` de navegadores.

### `GET /api/security/siem-alerts`

Historial de alertas enviadas por el SIEM exporter.

**Query params:** `severity`, `ruleEventType`, `from`, `to`, `limit`

### `POST /api/security/siem/run`

Ejecuta el SIEM exporter manualmente (bajo demanda).

### `GET /api/security/siem/test`

Envía una alerta de prueba a todos los webhooks SIEM configurados.

---

## Autenticación

### `POST /api/auth/validate-email`

Valida un email en tiempo real contra reglas anti-spam y anti-desechables.

**Request body:**
```json
{ "email": "usuario@dominio.com" }
```

**Response:**
```json
{
  "valid": true,
  "reason": null
}
```

**Rate limit:** 20 req/60s por IP

### `GET /auth/callback`

Callback de Magic Link de Supabase Auth. Valida el parámetro `next` contra open redirect.

**Rate limit:** 10 req/60s por IP

---

## Monitoreo

### `GET /api/monitoring`

Estado de monitoreo de todos los proyectos del usuario.

### `POST /api/telemetry/vitals`

Recibe métricas de Core Web Vitals desde el navegador del usuario (RUM).

**Request body:**
```json
{
  "lcp": 2500,
  "inp": 200,
  "cls": 0.05,
  "ttfb": 800,
  "fcp": 1200
}
```

### `POST /api/webhooks`

Endpoint para webhooks de integraciones externas. Validado con HMAC.

---

## Cron Jobs (Vercel)

| Endpoint | Schedule | Descripción |
|----------|----------|-------------|
| `/api/cron/uptime` | `0 0 * * *` (cada 24h) | Verificación de uptime de proyectos |
| `/api/cron/siem` | `*/5 * * * *` (cada 5min) | SIEM Exporter + Heartbeat |
| `/api/ai/healthcheck` | `0 */6 * * *` (cada 6h) | Health check de modelos con alertas |

Protegidos con `CRON_SECRET` en el header `x-cron-secret`.

---

## Push Notifications

### `POST /api/notifications/push-subscribe`

Suscribe un navegador para recibir notificaciones push del SIEM.

**Request body:**
```json
{
  "subscription": { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
}
```

---

## Códigos de error

| Código | Significado |
|--------|-------------|
| `200` | OK |
| `400` | Bad Request (payload inválido) |
| `401` | No autorizado |
| `429` | Rate limit excedido |
| `500` | Error interno del servidor |

Todas las respuestas de error incluyen un objeto con `error` y `retryAfter` (cuando aplica):

```json
{
  "error": "Demasiadas solicitudes. Intenta de nuevo en 45 segundos.",
  "retryAfter": 45
}
```
