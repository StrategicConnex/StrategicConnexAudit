# SCAUDIT Pro — Plan de Mejora Continua

> **Versión:** 1.0 — Julio 2026
> **Base:** Análisis competitivo de 10 herramientas del mercado (Shodan, Censys, SecurityTrails, GreyNoise, AttackIQ, Detectify, Moz Pro, SEMrush, Datadog, Grafana)
> **Ubicación:** `docs/improvements/COMPETITIVE-ANALYSIS.md`

---

## ═══════════════════════════════════════════════════════
## FASE 0 — CIMIENTOS (Completado ✅)
## ═══════════════════════════════════════════════════════

Lo que ya tenemos y funciona:

| Feature | Estado | Archivos/Docs |
|---------|--------|----------------|
| Magic Link Auth + email validation | ✅ | `src/app/login/`, `src/app/auth/` |
| Security headers (CSP, HSTS) | ✅ | `src/proxy.ts`, `src/app/layout.tsx` |
| Rate limiting (Upstash Redis) | ✅ | `src/shared/lib/ratelimit.ts` |
| AI Router con fallback multi-modelo | ✅ | `src/server/ai/ai-router.ts` |
| Intelligence scanning (21 tools) | ✅ | `src/server/intelligence/executors/` |
| Attack Surface Graph | ✅ | `src/app/components/AttackSurfaceGraph.tsx` |
| Score Gauge + Drift Detection | ✅ | `src/app/components/ScoreGauge.tsx` |
| Incident Brief con IA | ✅ | `src/app/api/intelligence/brief/` |
| AI Copilot Remediation | ✅ | `src/app/api/intelligence/copilot/` |
| Monitoreo uptime + Web Vitals | ✅ | `src/app/api/monitoring/` |
| RUM (Real User Monitoring) | ✅ | `src/shared/utils/rum.ts` |
| SEO auditing (GSC, GA4) | ✅ | `src/app/api/ai/report/` |
| Security Audit Logs + SIEM exporter | ✅ | `src/server/security/` |
| AI Health Dashboard | ✅ | `src/app/ai/health/` |
| Design System (indigo + chartreuse) | ✅ | `src/app/globals.css` |

---

## ═══════════════════════════════════════════════════════
## FASE 1 — P0: FUNDACIÓN (Completado 🟡)
## ═══════════════════════════════════════════════════════

### P0.1 ✅ Descubrimiento Continuo de Activos

**Archivos creados:**
- `src/server/intelligence/discovery/orchestrator.ts` — Orquestador central
- `src/server/intelligence/discovery/dns-brute.ts` — DNS brute force subdomain discovery
- `src/server/intelligence/discovery/ct-monitor.ts` — Certificate Transparency log monitoring
- `src/server/intelligence/discovery/shadow-detector.ts` — Shadow asset detection
- `src/server/intelligence/discovery/types.ts` — Tipos compartidos
- `src/trigger/discovery.trigger.ts` — Trigger.dev task cada 6h
- `src/app/api/intelligence/discovery/route.ts` — Endpoint REST

```mermaid
flowchart LR
    A[Cron Trigger 6h] --> B[DNS Brute Force]
    A --> C[Certificate Transparency]
    A --> D[Reverse DNS]
    B --> E{New Asset?}
    C --> E
    D --> E
    E -->|Yes| F[Insert → intelligence_assets]
    E -->|No| G[Update lastSeenAt]
    F --> H[Log asset_change]
    F --> I[Generate Security Finding]
    I --> J[Alert if exposed]
```

### P0.2 ✅ Historical DNS/WHOIS Tracking

**Completado.** Módulo completo de persistencia DNS/WHOIS + change detection + alertas SIEM.

**Archivos creados:**
- `src/server/intelligence/history/types.ts` — Tipos compartidos
- `src/server/intelligence/history/dns-history.ts` — Persistencia + detección DNS
- `src/server/intelligence/history/whois-history.ts` — Persistencia + auto-diff WHOIS
- `src/server/intelligence/history/orchestrator.ts` — Orchestrador (persist + detect + alert)
- `src/server/security/dns-change-alert.ts` — Alertas SIEM para cambios DNS
- `src/server/security/whois-change-alert.ts` — Alertas SIEM para cambios WHOIS
- `src/app/components/HistoryPanel.tsx` — UI DNS/WHOIS/Timeline en IntelligenceTab
- `src/app/api/intelligence/history/route.ts` — API endpoint con rate limit
- `src/shared/db/schemas/history.ts` — Tablas Drizzle
- `drizzle/0010_dns_whois_history.sql` — Migración SQL

**Dashboard de seguridad:**
- 4 pestañas en `/security/audit`: Events, SIEM, WHOIS Alerts, DNS Alerts
- Cada cambio WHOIS/DNS muestra diff visual con badges de severidad y canal de entrega

**Pipeline validado:** Test de integración contra Supabase real pasado exitosamente.

### P0.3 ✅ Alertas Multi-Canal en Tiempo Real

**Canales habilitados:**
1. ✅ **Slack** (vía SIEM exporter — webhook)
2. ✅ **Email** (Resend — template HTML rico con métricas)
3. ✅ **PagerDuty** (Events API v2)
4. ✅ **Splunk** (HEC HTTP Event Collector)
5. ✅ **Push notifications** (Web Push API — VAPID)

**Motor de alertas reutilizado:**
```typescript
// src/server/security/siem-exporter.ts — exporta:
export const WEBHOOK_FORMATTERS: Array<{
  envVar: string;      // "SIEM_WEBHOOK_SLACK" | "RESEND_API_KEY" | ...
  formatter: (p: SiemPattern) => WebhookPayload;
  name: string;        // "Slack" | "Email" | "PagerDuty" | "Splunk"
}>;
```

**Nuevo:** Alertas de expiración de API Keys via `src/server/security/api-key-expiry-alert.ts`

---

## ═══════════════════════════════════════════════════════
## FASE 2 — P1: CORE FEATURES (Completado 🟡)
## ═══════════════════════════════════════════════════════

### P1.1 ✅ API Pública REST

**Endpoints públicos (sin sesión, con API Key):**

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/public/v1/health` | GET | Health check público (sin auth) |
| `GET /api/public/v1/intelligence` | GET | Listar investigaciones |
| `POST /api/public/v1/intelligence` | POST | Crear investigación |

**Arquitectura:**
```text
src/app/api/public/
├── v1/
│   ├── health/route.ts        # Health check (sin auth)
│   └── intelligence/route.ts  # CRUD investigaciones (API Key auth)
src/server/api/
└── public-router.ts           # withPublicApi middleware (API Key auth + rate limit)
```

### P1.2 ✅ Reportes PDF White-Label

**Stack:** `@react-pdf/renderer` con SVG nativo

**Features:**
- Logo del cliente + colores corporativos
- Donut chart de severidad de findings (SVG)
- Bar chart de scores por investigación (SVG)
- Assets descubiertos (subdominios, IPs, certificados)
- Branding guardado en localStorage

**Archivos:**
- `src/app/api/reports/pdf/route.ts` — Endpoint de generación
- `src/app/components/DownloadPdfButton.tsx` — Botón con progress bar + toast

### P1.3 ✅ Team Collaboration + RBAC

**Modelo RBAC completo con 5 roles:** `OWNER | ADMIN | EDITOR | VIEWER | GUEST`

**Archivos:**
- `src/server/auth/rbac.ts` — `canPerformAction()`, `hasRolePermission()`, tipos `ProjectRole` y `PermissionAction`
- `src/app/api/projects/[id]/members/route.ts` — Endpoint REST para gestión de miembros (GET/POST/DELETE)
- `src/shared/db/schemas/teams.ts` — Tabla `project_members` + enum `project_role`

**Features:**
- Verificación de permisos jerárquica (owner > admin > editor > viewer > guest)
- Acciones protegidas: `create_project`, `delete_project`, `manage_members`, `run_audit`, `view_reports`
- Integración con `withRLS()` para seguridad a nivel BD

---

### P1.4 ✅ CI/CD Webhook Integration

**Archivos:**
- `src/app/api/webhooks/cicd/route.ts` — Endpoint CI/CD que recibe webhooks de pipelines
- `src/app/api/webhooks/route.ts` — Endpoint genérico de webhooks con validación HMAC

**Features:**
- Validación HMAC para autenticidad del webhook
- Disparo automático de escaneos al recibir push
- Webhook genérico con rate limiting

---

### P1.5 ✅ Scheduled Scanning

**Archivos:**
- `src/trigger/scheduled-scan.trigger.ts` — Trigger.dev task con cron cada hora

**Features:**
- Evalúa proyectos con escaneos agendados activos
- Dispara auditorías de inteligencia automáticamente
- Logging de ejecución en consola

---

### P1.6 ✅ MITRE ATT&CK Mapping

**Cobertura:** 25+ técnicas MITRE mapeadas por toolId exacto

```mermaid
flowchart LR
    A[Tool Registry] -->|toolId| B[MITRE_MAPPING]
    B --> C[MitreTechnique]
    C --> D{Tactic}
    D --> E[Reconnaissance TA0043]
    D --> F[Resource Dev TA0042]
    D --> G[Initial Access TA0001]
    D --> H[Discovery TA0007]
    D --> I[C2 TA0011]
```

**Archivos:**
- `src/server/intelligence/mitre/mapping.ts` — Mapping server-side + coverage stats
- `src/app/components/MitreBadge.tsx` — Badge UI con tooltip de técnica
- `src/app/mitre-coverage/page.tsx` — Dashboard de cobertura con gráficos
- `src/shared/data/mitre-mapping.ts` — Data compartida (25+ técnicas)

---

## ═══════════════════════════════════════════════════════
## FASE 3 — P2: UX/DASHBOARD (67% completado 🟡)
## ═══════════════════════════════════════════════════════

### P2.1 ✅ Interactive Geography Map

**Stack:** Leaflet.js (open source, sin API key)

**Archivos:**
- Mapa GeoIP en IntelligenceTab con markers de activos
- Clusters para múltiples IPs en misma región
- Tooltips con severidad y tipo de activo

### P2.2 ✅ Custom Dashboards Drag-and-Drop

**Archivos:**
- `src/app/components/CustomDashboardGrid.tsx` — Grid de widgets arrastrables con persistencia en localStorage

**Widgets disponibles:**
- Score Gauge, Health Timeline, Activity Terminal, Attack Surface Graph, Geo Map
- Persistencia de orden y visibilidad por usuario

---

### P2.3 ✅ Asset Graph Traversal

**Archivos:**
- `src/app/api/intelligence/graph/route.ts` — Endpoint de graph traversal con búsqueda por nodeId

**Features:**
- Navegación entre dominios ⇄ IPs ⇄ certificados
- Relaciones de activos descubiertos

---

### P2.4 ✅ Technology Profiling (BuiltWith-like)

**Estado:** Completado — detector de 40+ tecnologías vía HTTP headers, DNS CNAME, cookies, meta tags, script src e inline JS.

**Archivos:**
- `src/server/intelligence/executors/technology-profiler.ts` — Motor de detección con 6 métodos de fingerprinting
- `src/server/intelligence/core/executor-registry.ts` — Registro como `website.tech_stack`
- `src/server/intelligence/registry/tool-registry.ts` — Tool entry con ID `website.tech_stack`

**Capacidades de detección:**
| Método | Signaturas | Detecta |
|--------|-----------|---------|
| HTTP Headers | 21 | Nginx, Apache, Cloudflare, Caddy, IIS, LiteSpeed, Express.js, Next.js, ASP.NET, PHP, WordPress, Drupal, Vercel, Akamai, CloudFront, Fastly, Azure CDN, Sucuri |
| DNS CNAME | 5 | Cloudflare, CloudFront, Fastly, Akamai, Azure CDN |
| Cookies | 6 | Cloudflare, PHP, ASP.NET, Laravel, GA, Meta Pixel |
| Meta tags | 10 | WordPress, Drupal, Joomla, Shopify, Ghost, Astro, Hugo, Webflow, Squarespace, Wix |
| Script src | 37 | Next.js, Nuxt.js, React, Vue.js, Angular, Svelte, Gatsby, Remix, jQuery, D3.js, Chart.js, Moment.js, Lodash, GSAP, Swiper, Three.js, Bootstrap, Tailwind CSS, Font Awesome, WordPress, Shopify, Contentful, Sanity, Strapi, Prismic, Magento, GTM, GA, Hotjar, Clarity, Mixpanel, Amplitude, FullStory, HubSpot, Meta Pixel, LinkedIn |
| Inline JS | 3 | Google Analytics, Meta Pixel, Google Tag Manager |

---

### P2.5 ✅ Cloud Bucket Detection

**Archivos:**
- `src/server/intelligence/executors/bucket-detector.ts` — Detector de buckets cloud vía DNS

**Features:**
- Detecta S3, GCS, Azure Blob expuestos
- Modo agresivo con permutaciones de nombres

---

### P2.6 ✅ Live Streaming Metrics via WebSocket

**Estado:** Completado — métricas en vivo via polling JSON cada 15s (setInterval, compatible con Vercel serverless, sin SSE/WebSocket por límite de 10s en plan Hobby).

**Archivos creados:**
- `src/app/api/intelligence/live/route.ts` — Endpoint JSON con uptime %, latencia promedio, findings críticos y últimos eventos
- `src/app/components/LiveMetricsBar.tsx` — Componente colapsable (hover-to-expand) que consume el endpoint cada 15s
- `src/features/intelligence/components/IntelligenceShell.tsx` — Integrado como barra flotante bottom-right

**Métricas transmitidas (cada 15s):**
| Métrica | Fuente | Descripción |
|---------|--------|-------------|
| Uptime % | `uptimeLogs` | Últimos 5 checks en ventana de 24h |
| Latencia promedio | `uptimeLogs` | Response time promedio (ms) |
| Findings críticos/high | `intelligence_findings` | Conteo de severidad crítica y alta |
| Eventos recientes | `intelligence_run_events` | Total de eventos activos |

**Trade-off:** Se usó polling (HTTP GET cada 15s) en lugar de SSE/WebSocket porque Vercel serverless (plan Hobby) tiene un timeout máximo de 10s por función. El polling es más confiable y permite conexión inmediata sin requerir un servidor persistent

---

## ═══════════════════════════════════════════════════════
## FASE 4 — P3: DESEABLE ⬜
## ═══════════════════════════════════════════════════════

### P3.1 ⬜ Mobile App / PWA

**Inspiración:** Shodan, todas las herramientas modernas

**Potencial:** Aplicación progresiva (PWA) con service worker, notificaciones push offline, y responsive mobile-first. Ya existe `PushSubscribeButton.tsx` como proto de Service Worker.

---

### P3.2 ⬜ Anomaly Detection ML

**Inspiración:** Datadog, GreyNoise

**Potencial:** Detección automática de picos anómalos en LCP, uptime, latencia. Clasificación de IPs (benign/malicious/unknown). Tags asociados a CVEs.

---

### P3.3 ⬜ Adversary Simulation

**Inspiración:** AttackIQ, Pentera

**Potencial:** Simulación controlada de vectores de ataque reales. Reconstrucción de attack path y kill-chain. Pruebas de credenciales filtradas y configuraciones débiles.

---

### P3.4 ⬜ Plugin / Module Marketplace

**Inspiración:** Detectify

**Potencial:** Checklists de seguridad mantenidas por la comunidad. Módulos extensibles para escaneos personalizados.

---

### P3.5 ⬜ Multi-language (INGLÉS)

**Inspiración:** Todas las herramientas globales

**Potencial:** Internacionalización completa. El 100% de la competencia tiene UI en inglés. SCAUDIT actualmente es solo español.

---

### P3.6 ⬜ Benchmarking Dashboard

**Inspiración:** Moz Pro, SEMrush

**Potencial:** "Tu score vs. industria" — comparar métricas de seguridad y rendimiento contra promedios del sector.

---

## ═══════════════════════════════════════════════════════
## MEJORAS ADICIONALES COMPLETADAS
## ═══════════════════════════════════════════════════════

### 🏠 API Keys Dashboard (`/settings/api-keys`)

Dashboard visual completo con:
- 4 stat cards (Active Keys, Used This Week, Total Requests, Expiring Soon)
- Create form con expiración seleccionable (30/90/365d o Never)
- Tabla con búsqueda, filtros, sort, mini-bars de uso
- Reveal modal con raw key (una sola vez)
- Revoke con confirm dialog

**Endpoint de uso real:** `GET /api/api-keys/:id/usage` — consulta `security_audit_logs`

### 📖 Swagger UI (`/swagger`)

- OpenAPI 3.0 spec en `public/openapi.json`
- Cargado con `next/dynamic` + `ssr: false` (~3MB bundle lazy)
- Dark theme completo con tokens del design system
- Endpoint público `/api/public/v1/health` sin candado 🔓

### 📚 API Documentation (`/docs/api`)

- Documentación completa de endpoints con ejemplos curl
- API Playground interactivo (`/docs/api/playground`)
- RateLimit headers documentados

### 🛡️ Security Audit Dashboard (`/security/audit`)

- Filtros por tipo de evento, IP, rango de fechas
- Pestaña SIEM Alerts con historial de alertas enviadas
- Botón "Test Webhooks" que dispara alerta de prueba
- SIEM heartbeat cada 30 min

### 📱 Push Notifications

- Web Push API con VAPID keys
- `PushSubscribeButton` en UI
- SIEM alerts vía push
- `POST /api/notifications/push-subscribe`

### 🔐 API Key Expiry Alerts

- Daily cron (09:00 UTC) via Trigger.dev
- Detecta keys expirando en 1-7 días
- Alerta via todos los canales SIEM configurados
- Audit trail en `security_audit_logs`

---

## ═══════════════════════════════════════════════════════
## MÉTRICAS DE PROGRESO
## ═══════════════════════════════════════════════════════

| Fase | Items | Completado | % |
|------|-------|------------|---|
| Fase 0 — Cimientos | 15 | 15 | ✅ 100% |
| Fase 1 — P0 Fundación | 3 | 3 | ✅ **100%** |
| Fase 2 — P1 Core Features | 6 | 6 | ✅ **100%** |
| Fase 3 — P2 UX/Dashboard | 6 | 6 | ✅ **100%** |
| Fase 4 — P3 Deseable | 6 | 0 | ⬜ 0% |
| **Total** (incluye P3) | **36** | **30** | **✅ 83%** |

> **Nota:** El progreso sin contar Fase 4 (P3 Deseable) es **30/30 = 100%** — el producto base está completo. La Fase 4 se agregó como visión a futuro y reduce el porcentaje total a 83%.

---

## ═══════════════════════════════════════════════════════
## PENDIENTE PARA PRÓXIMOS SPRINTS
## ═══════════════════════════════════════════════════════

### P3.1 Mobile App / PWA

**Estado:** Pendiente.

**Estimación:** 5-7 días

### P3.2 Anomaly Detection ML

**Estado:** Pendiente.

**Estimación:** 10-15 días

### P3.3 Adversary Simulation

**Estado:** Pendiente.

**Estimación:** 10-15 días

### P3.4 Plugin Marketplace

**Estado:** Pendiente.

**Estimación:** 7-10 días

### P3.5 Multi-language (INGLÉS)

**Estado:** Pendiente.

**Estimación:** 5-7 días

### P3.6 Benchmarking Dashboard

**Estado:** Pendiente.

**Estimación:** 5-7 días

---

## ═══════════════════════════════════════════════════════
## DEPENDENCIAS Y SECUENCIAMIENTO
## ═══════════════════════════════════════════════════════

```mermaid
flowchart TD
    P0_1[P0.1 Discovery Continuo] --> P0_2[P0.2 DNS/WHOIS History]
    P0_1 --> P0_3[P0.3 Alertas Multi-Canal]
    P0_2 --> P1_2[P1.2 Reportes PDF]
    P0_2 --> P2_3[P2.3 Asset Graph]
    P0_3 --> P1_4[P1.4 CI/CD Webhook]
    P1_1[P1.1 API Pública] --> P3_4[P3.4 Benchmarking]
    P0_3 --> P1_4[P1.4 CI/CD Webhook]
    P1_1[P1.1 API Pública] --> P3_6[P3.6 Benchmarking]
    P1_3[P1.3 Team RBAC] --> P1_2[P1.2 Reportes PDF]
    P1_6[P1.6 MITRE ATT&CK] --> P2_2[P2.2 Custom Dashboards]
    P2_1[P2.1 Geo Map] --> P2_3[P2.3 Asset Graph]
    P2_6[P2.6 Live Streaming] --> P2_2
```

---

## ═══════════════════════════════════════════════════════
## NOTAS DE ARQUITECTURA
## ═══════════════════════════════════════════════════════

### Patrones a mantener:
1. **Server Components** para datos, Client Components para interactividad
2. **withRLS** para seguridad a nivel BD
3. **callAIWithFallback** para tolerancia a fallos de IA
4. **withRateLimit** decorator genérico para rate limiting
5. **CSP + Security Headers** en proxy.ts
6. **withPublicApi** middleware para API pública con API Key auth
7. **WEBHOOK_FORMATTERS** exportable para alertas multi-canal
8. **MitreBadge** component para mapeo MITRE en hallazgos

### Stack a mantener:
- **Next.js 16** (Turbopack, RSC, Server Actions)
- **Supabase** (Auth, PostgreSQL, RLS)
- **Upstash Redis** (Rate limiting, caché)
- **Trigger.dev** (Background jobs, cron)
- **OpenRouter** (Modelos de IA gratuitos)
- **Drizzle ORM** (Type-safe SQL)
- **Tailwind CSS v4** (Design System)
- **Leaflet.js** (Mapas GeoIP)
- **React-PDF** (Reportes PDF)
