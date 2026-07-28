---
layout: default
title: Seguridad
nav_order: 4
permalink: /docs/security
---

# Arquitectura de Seguridad

{: .no_toc }

<details open markdown="block">
  <summary>Tabla de contenidos</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

SCAUDIT Pro implementa seguridad en múltiples capas: red, aplicación, autenticación, monitoreo y respuesta. Este documento describe cada capa en detalle.

## Capas de seguridad

```
┌─────────────────────────────────────────────────────┐
│              1. Content Security Policy (CSP)        │
│         Aplicado dinámicamente con nonce/request     │
├─────────────────────────────────────────────────────┤
│              2. Rate Limiting (Upstash Redis)        │
│         20 req/60s email · 5 req/60s AI · etc.      │
├─────────────────────────────────────────────────────┤
│              3. Protección SSRF (Egress Guard)       │
│           Validación CIDR IPv4 e IPv6 completa       │
├─────────────────────────────────────────────────────┤
│              4. SIEM Exporter + Auditoría            │
│       Detección de patrones + alertas + audit log    │
├─────────────────────────────────────────────────────┤
│              5. Autenticación (Supabase Auth)        │
│       Magic Link · Anti-open-redirect · Validación   │
└─────────────────────────────────────────────────────┘
```

---

## 1. Content Security Policy (CSP)

La CSP se aplica en **dos capas** para defensa en profundidad:

### Capa 1: HTTP Header (proxy.ts)

Aplicada dinámicamente por `src/proxy.ts` en cada request:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' ['unsafe-eval' en dev];
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://*.supabase.co https://apifreellm.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  report-uri /api/security/csp-report
```

### Capa 2: Meta Tag (layout.tsx)

Capa adicional para páginas prerendered (estáticas):

```html
<meta httpEquiv="Content-Security-Policy" content="..." />
```

### Reportes

Las violaciones CSP se envían a `/api/security/csp-report` y se persisten en `security_audit_logs` para análisis posterior.

---

## 2. Rate Limiting

### Arquitectura

```
Request → extractClientIp() → Upstash Redis → Handler | 429
                │
                ▼
         security_audit_logs
```

### Identificación por IP

El orden de precedencia para extraer la IP real del cliente:

1. `x-vercel-forwarded-for` (header autoritativo de Vercel, no falsificable)
2. `x-real-ip` (proxy confiable: Nginx, Cloudflare, AWS)
3. `x-forwarded-for` (último recurso, primer valor puede ser falsificado)
4. Fallback hash de User-Agent + Accept-Language

### Límites configurados

| Endpoint | Límite | Ventana | Identificador |
|----------|--------|---------|---------------|
| `POST /api/auth/validate-email` | 20 | 60s | IP |
| `GET /auth/callback` | 10 | 60s | IP |
| `POST /api/ai/copilot` | 5 | 60s | User ID |
| `POST /api/ai/report` | 5 | 60s | User ID |
| `POST /api/intelligence/copilot` | 5 | 60s | User ID |
| `POST /api/intelligence/brief` | 5 | 60s | User ID |
| `POST /api/bulk-scan` | 3 | 60s | IP |

### Decorador `withRateLimit`

```typescript
export const POST = withRateLimit(
  { limit: 20, window: 60, prefix: "validate_email" },
  async (req, identifier) => {
    return NextResponse.json({ success: true });
  }
);
```

El decorador:
1. Extrae la IP del cliente
2. Autentica opcionalmente al usuario
3. Verifica rate limit en Redis
4. Si excede → responde 429 con headers estándar + audit log
5. Si ok → ejecuta handler + adjunta headers `X-RateLimit-*`

### Fail-close en producción

Si Redis no está disponible:
- **Producción:** Deniega el request (fail-closed)
- **Desarrollo:** Permite el request (fail-open)

---

## 3. Protección SSRF (Egress Guard)

### Cobertura

16 rangos privados IPv4 + 7 rangos IPv6 bloqueados:

```
IPv4: 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8,
      169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16,
      224.0.0.0/4, 240.0.0.0/4, y más...

IPv6: ::/128, ::1/128, fc00::/7, fe80::/10, ff00::/8, etc.
```

### Funciones principales

| Función | Propósito |
|---------|-----------|
| `isBlockedAddress(ip)` | Verifica si una IP está en rangos bloqueados (CIDR matemático) |
| `assertPublicHostname(host)` | Resuelve DNS y verifica que todas las IPs sean públicas |
| `safeFetch(url, init)` | Wrapper de fetch con timeout, redirect manual y validación |

### safeFetch

```typescript
const response = await safeFetch("https://example.com/api", {
  headers: { Authorization: "Bearer xxx" }
});
// Lanza error si el destino resuelve a IP privada
```

---

## 4. SIEM & Auditoría

### Pipeline

```
Evento de seguridad → logSecurityEvent() → security_audit_logs (DB)
                                                      │
                                              cada 5 min (cron)
                                                      ▼
                                              runSiemExport()
                                                      │
                                          ┌───────────┴───────────┐
                                          ▼                      ▼
                                    Detecta patrones        Heartbeat
                                    (7 reglas)              (c/30 min)
                                          │
                              ┌───────────┼───────────┐
                              ▼           ▼           ▼
                          Slack     PagerDuty     Splunk
```

### Reglas de detección

| Regla | Evento | Threshold | Ventana | Severidad |
|-------|--------|-----------|---------|-----------|
| Open Redirect Attack | `open_redirect_attempt` | 3 | 5 min | 🔴 Critical |
| Rate Limit Bypass | `rate_limit_bypass` | 1 | 5 min | 🔴 Critical |
| AI Model Failure | `ai_model_health` | 1 | 5 min | 🔴 Critical |
| Rate Limit Spike | `rate_limit_hit` | 20 | 5 min | 🟡 Warning |
| CSP Violation Spike | `csp_violation` | 10 | 10 min | 🟡 Warning |
| Auth Failure Burst | `auth_failure` | 5 | 5 min | 🟡 Warning |
| Invalid Input Spike | `invalid_input` | 10 | 5 min | 🔵 Info |

### Eventos de auditoría

Todos los eventos de seguridad se registran con estructura uniforme:

```typescript
{
  eventType: "rate_limit_hit" | "open_redirect_attempt" | "csp_violation" | ...,
  ip: "192.168.1.1",
  userId: "uuid" | null,
  path: "/api/auth/validate-email",
  method: "POST",
  userAgent: "Mozilla/5.0 ...",
  metadata: { ... },
  timestamp: "2026-07-28T12:00:00.000Z"
}
```

### Dashboard de Seguridad

Disponible en `/security/audit` con:
- Filtros por tipo de evento, IP y rango de fechas
- Historial de alertas SIEM enviadas
- Botón "Test Webhooks" para probar conectividad

---

## 5. Autenticación

### Magic Link Flow

```
Usuario ingresa email → POST /api/auth/validate-email
                              │
                         Validación anti-spam
                         (400+ dominios bloqueados)
                              │
                         Rate limit check (20/60s)
                              │
                         Supabase Auth envía Magic Link
                              │
                         Usuario hace clic → /auth/callback
                              │
                         Validación anti-open-redirect
                         Rate limit check (10/60s)
                              │
                         Sesión iniciada → Redirect a dashboard
```

### Validación de email

- **Anti-spam:** 400+ dominios temporales/desechables bloqueados
- **Anti-typosquatting:** Patrones sospechosos detectados
- **Rate limiting:** 20 intentos/minuto por IP
- **Fail-safe:** Si la API de validación falla, se usa validación local básica

### Protección anti-open-redirect

El parámetro `next` en `/auth/callback` se valida estrictamente:

- Solo rutas relativas que comienzan con `/`
- Bloquea URLs absolutas (`https://evil.com`)
- Bloquea protocol-relative URLs (`//evil.com`)
- Bloquea hostnames maliciosos (`@evil.
