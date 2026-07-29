---
layout: default
title: Changelog
nav_order: 6
permalink: /docs/changelog
---

# Changelog — StrategicAudit Pro (SCAUDIT)

{: .no_toc }

<details open markdown="block">
  <summary>Table of Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Julio 2026 — Sprint 3: History + Alerting + API

### P0.2 ✅ Historical DNS/WHOIS Tracking

**Nuevo módulo:** `src/server/intelligence/history/`

Módulo completo de persistencia histórica y detección de cambios para registros DNS y WHOIS.

| Archivo | Propósito |
|---------|-----------|
| `src/server/intelligence/history/types.ts` | Tipos compartidos: `DnsSnapshot`, `WhoisSnapshot`, `DnsChange`, `WhoisChange` |
| `src/server/intelligence/history/dns-history.ts` | Persistencia de snapshots DNS + `detectDnsChanges()` con diff entre snapshots |
| `src/server/intelligence/history/whois-history.ts` | Persistencia WHOIS con SHA-256 dedup + diff automático (`diffSummary`) |
| `src/server/intelligence/history/orchestrator.ts` | `processDnsResults()` y `processWhoisResults()`: coordinan persist + change detection |
| `src/shared/db/schemas/history.ts` | Esquemas Drizzle: `dnsHistory`, `whoisHistory` |
| `drizzle/0010_dns_whois_history.sql` | Migración SQL con índices y FK a projects |

**Endpoints:**

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/intelligence/history` | Query historial con filtros por tipo (dns/whois), dominio, fechas |

**UI:** HistoryPanel en IntelligenceTab con 3 tabs:
- 📡 DNS — registros A/AAAA/MX/NS/TXT con badges color-coded
- 📖 WHOIS — snapshots con badges de expiración y diff
- 📊 Timeline — cambios detectados entre snapshots consecutivos

### 🔐 API Pública REST

**Nuevo módulo:** `src/server/api/public-router.ts`

| Endpoint | Método | Auth | Propósito |
|----------|--------|------|-----------|
| `GET /api/public/v1/health` | GET | ❌ (público) | Health check del sistema |
| `GET /api/public/v1/intelligence` | GET | API Key | Listar investigaciones |
| `POST /api/public/v1/intelligence` | POST | API Key | Crear investigación |

**Middleware:** `withPublicApi()` — valida API Key + rate limit por key + audit log.

### 🔑 API Keys Dashboard

| Componente | Ruta |
|------------|------|
| Dashboard visual | `/settings/api-keys` |
| Stat cards | Active Keys, Used This Week, Total Requests, Expiring Soon |
| Create form | Expiración seleccionable (30/90/365d/Never) |
| Tabla | Búsqueda, filtros, sort, mini-bars de uso |
| Reveal modal | Raw key (una sola vez) + copiar |
| Revoke | Confirm dialog |
| Endpoint uso | `GET /api/api-keys/:id/usage` (consulta security_audit_logs) |

### 📄 Reportes PDF White-Label

| Archivo | Propósito |
|---------|-----------|
| `src/app/api/reports/pdf/route.ts` | Endpoint de generación POST |
| `src/app/api/reports/pdf/progress/route.ts` | Progress SSE para el botón |
| `src/server/reports/pdf-template.tsx` | Template @react-pdf con SVG charts |
| `src/app/components/DownloadPdfButton.tsx` | Botón con progress bar + toast |
| `src/app/components/PdfProgressBar.tsx` | Barra de progreso animada |

**Features:**
- Donut chart de severidad de findings (SVG)
- Bar chart de scores por investigación (SVG)
- Assets descubiertos (subdominios, IPs, certificados)
- Branding guardado en localStorage

### 📖 Swagger UI + API Documentation

| Ruta | Propósito |
|------|-----------|
| `/swagger` | Swagger UI interactiva (lazy-loaded con next/dynamic) |
| `/docs/api` | Documentación completa con ejemplos curl |
| `/docs/api/playground` | Try-it-yourself interactivo |
| `/openapi.json` | Especificación OpenAPI 3.0 |

### 🛡️ Security Audit Dashboard

**Ruta:** `/security/audit`

| Pestaña | Fuente | Propósito |
|---------|--------|-----------|
| 🛡️ Security Events | `security_audit_logs` | Todos los eventos de seguridad |
| 📡 SIEM Alerts | `siem_alert_logs` | Alertas enviadas por el SIEM exporter |
| 🔍 WHOIS Alerts | `siem_alert_logs` WHERE `whois_change_detected` | Cambios WHOIS con diff visual |
| 🌐 DNS Alerts | `siem_alert_logs` WHERE `dns_change_detected` | Cambios DNS con badges de record type |

### 🔐 API Key Expiry Alerts

| Archivo | Propósito |
|---------|-----------|
| `src/server/security/api-key-expiry-alert.ts` | Detecta keys próximas a expirar y alerta |
| `src/trigger/api-key-expiry.trigger.ts` | Cron diario 09:00 UTC via Trigger.dev |

### 📱 Push Notifications

| Archivo | Propósito |
|---------|-----------|
| `src/app/api/notifications/push-subscribe/route.ts` | Suscripción push |
| `src/shared/db/schemas/push-subscriptions.ts` | Tabla de suscripciones |
| `src/server/notifications/push.ts` | Servicio de envío push |

---

## Julio 2026 — Sprint 2: DNS/WHOIS Alerts + Security Dashboard

### 🌐 DNS Change Alerts (SIEM)

**Nuevo:** `src/server/security/dns-change-alert.ts`

`sendDnsChangeAlerts(domain, changes)` — envía alertas cuando `detectDnsChanges()` encuentra modificaciones en registros DNS.

| Cambio | Severidad | Ejemplo |
|--------|-----------|---------|
| MX/NS eliminado | 🔴 critical | `"10 mail.com" → null` |
| Cualquier registro modificado | 🟡 warning | `"1.2.3.4" → "5.6.7.8"` |
| Registro añadido | 🔵 info | `null → "ns3.backup.com"` |

### 🔍 WHOIS Change Alerts (SIEM)

**Nuevo:** `src/server/security/whois-change-alert.ts`

`sendWhoisChangeAlerts(domain, changes)` — envía alertas cuando `persistWhoisSnapshot()` detecta cambios.

| Cambio | Severidad | Ejemplo |
|--------|-----------|---------|
| 🏢 Registrador cambió | 🟡 warning | `"GoDaddy" → "Namecheap"` |
| 📅 Expiración cambió | 🔴 critical | `"2026-07-31" → "2026-09-15"` |
| 🌐 Nameservers cambiaron | 🟡 warning | `"ns1.old.com" → "ns1.new.com"` |

### ⚡ DNS Executors refactorizados

`dns-executors.ts`: 4 executors (lookup, mx, txt, ns) reemplazaron llamadas raw a `persistDnsSnapshot()` por `processDnsResults()` del orchestrator, que ejecuta batch persist + change detection automático.

### 🗺️ Mapa Geo Interactivo

**Nuevo:** `src/app/components/GeoMap.tsx`

- Leaflet.js con markers de activos GeoIP
- Clusters para múltiples IPs en misma región
- Tooltips con severidad y tipo de activo
- Integración en IntelligenceTab

---

## Julio 2026 — Sprint 1: Continuous Discovery + MITRE + Alertas

### P0.1 ✅ Descubrimiento Continuo de Activos

**Nuevo módulo:** `src/server/intelligence/discovery/`

| Archivo | Propósito |
|---------|-----------|
| `types.ts` | Tipos: `DiscoveryOptions`, `DiscoveryResult`, `DiscoveryAsset` |
| `dns-brute.ts` | DNS brute force con 50+ subdominios comunes |
| `ct-monitor.ts` | Certificate Transparency log monitoring |
| `shadow-detector.ts` | Shadow asset detection por similitud |
| `orchestrator.ts` | Orquestador que ejecuta los 3 módulos en paralelo |

**Trigger:** `src/trigger/discovery.trigger.ts` — Cron cada 6h via Trigger.dev

**API:** `GET /api/intelligence/discovery` — Ejecuta descubrimiento bajo demanda

### P1.6 ✅ MITRE ATT&CK Mapping

**Nuevos archivos:**

| Archivo | Propósito |
|---------|-----------|
| `src/shared/data/mitre-mapping.ts` | 25+ técnicas MITRE mapeadas por toolId |
| `src/server/intelligence/mitre/mapping.ts` | Mapping server-side + coverage stats |
| `src/app/components/MitreBadge.tsx` | Badge UI con tooltip de técnica |
| `src/app/mitre-coverage/page.tsx` | Dashboard de cobertura con gráficos |

**Cobertura:** Reconnaissance (TA0043), Resource Development (TA0042), Initial Access (TA0001), Discovery (TA0007), Command & Control (TA0011), Defense Evasion (TA0005)

### P0.3 ✅ Alertas Multi-Canal en Tiempo Real

**Canales:**

1. ✅ **Slack** — vía webhook con formato rico (mrkdwn + blocks)
2. ✅ **Email** — Resend con template HTML corporativo oscuro
3. ✅ **PagerDuty** — Events API v2 con dedup key
4. ✅ **Splunk** — HEC HTTP Event Collector
5. ✅ **Push notifications** — Web Push API con VAPID

### P1.1 ✅ API Pública REST (inicial)

- `src/server/api/public-router.ts` — withPublicApi middleware
- Endpoints: health, intelligence list, intelligence create

### 🧪 Tests de Integración

| Archivo | Propósito |
|---------|-----------|
| `src/server/intelligence/history/pipeline-test.ts` | Test end-to-end del pipeline P0.2 contra Supabase real |

---

## Junio 2026 — Sprint 0: Fundación

### Features base

- Magic Link Auth + email validation (400+ dominios bloqueados)
- Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- Rate limiting con Upstash Redis (decorator genérico `withRateLimit`)
- AI Router con fallback multi-modelo (OpenRouter free pool)
- Intelligence scanning (21 herramientas: DNS, WHOIS, GeoIP, SSL/TLS, OSINT)
- Attack Surface Graph con React Flow
- Score Gauge + Drift Detection
- Incident Brief con IA (C-suite reporting)
- AI Copilot Remediation (planes técnicos paso a paso)
- SEO auditing (GSC/GA4 integration)
- Security Audit Logs + SIEM exporter
- AI Health Dashboard
- Design System (índigo + chartreuse, OKLCH tokens)
- RUM (Real User Monitoring) con Web Vitals
- Uptime monitoring
- Integración con Trigger.dev (background jobs)
- Documentación GitHub Pages

---

## Métricas de progreso

| Fase | Items | Completado | % |
|------|-------|------------|---|
| Fase 0 — Cimientos | 15 | 15 | ✅ 100% |
| Fase 1 — P0 Fundación | 3 | 3 | ✅ **100%** |
| Fase 2 — P1 Core Features | 6 | 3 | 🟡 50% |
| Fase 3 — P2 UX/Dashboard | 6 | 1 | 🟢 17% |
| **Total** | **30** | **22** | **73%** |
