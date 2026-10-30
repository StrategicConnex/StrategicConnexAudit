---
version: 2.5
date: 2026-10-29
author: Equipo SCAUDIT — Security Review
status: Revisión estática actualizada 2026-10-29 — hallazgos abiertos documentados en §19; la aprobación histórica v2.4 queda reemplazada
---

# 🔐 SCAUDIT — Reporte de Auditoría de Seguridad (OWASP / DevSecOps)

> **Baseline histórica:** 2026-08-09 · **Versión histórica:** 2.4 · VULN-001..010 se cerraron según las verificaciones documentadas entonces. La revisión actual del **2026-10-29** y sus hallazgos abiertos están en §19; su resultado prevalece sobre el resumen histórico.
> **Metodología:** OWASP Top 10 + Cheat Sheet Series · trazado de flujo de datos (UI → API → Admin SDK → DB) · adversarial analysis · reporte HIGH-confidence-only.
> **Alcance de la revisión histórica v2.4:** commit `739e09d` (post-B01), inventario de 42 rutas, separación cliente/servidor y secretos. La revisión de 2026-10-29 es un análisis estático del checkout actual; no es una prueba de penetración del despliegue.

---

## 1. Scope y objetivos

| Item | Valor |
|---|---|
| **Alcance** | Aplicación SCAUDIT completa: frontend React/Next.js, API routes (42 rutas inventariadas), Server Actions, AI Router, executor sandbox, capa de datos Supabase (RLS), webhooks y API pública |
| **Objetivo** | Identificar vulnerabilidades explotables (XSS, SSRF, IDOR, RCE, fallos de authz) con severidad priorizada y pasos de remediación |
| **Fuera de alcance** | Infraestructura cloud (Vercel/Supabase config), dependencias de terceros, tests de intrusión activos en producción |
| **Nivel de confianza** | Solo HIGH confidence — patrones vulnerables + input atacante confirmado tras research |

---

## 2. Requisitos de seguridad (REQ) y matriz OWASP

### 2.1 Requisitos de seguridad

| ID | Requisito | Prioridad | Fuente |
|---|---|---|---|
| REQ-001 | Ninguna salida de IA puede renderizarse como HTML sin sanitización | Alta | OWASP XSS / LLM Top 10 |
| REQ-002 | Los secretos de firma (webhook) no deben exponerse en respuestas de lectura | Alta | OWASP Secrets Management |
| REQ-003 | Toda ruta de UI sensible debe exigir sesión activa en el middleware | Media | OWASP A01 Broken Access Control |
| REQ-004 | Todo acceso a datos multi-tenant pasa por RLS o verificación explícita de ownership | Alta | OWASP A01 IDOR |
| REQ-005 | Ningún executor remoto lanza shells ni opera fuera de la allowlist con egress-guard | Crítica | SSRF/RCE prevention |
| REQ-006 | Toda ruta API que exponga datos de un proyecto debe exigir sesión activa o API key con ownership | Alta | OWASP A01 / A05 |
| REQ-007 | Ningún secreto/env en el repo; `NEXT_PUBLIC_*` solo con valores públicos | Crítica | OWASP Secrets Management |

### 2.2 Matriz OWASP Top 10

| OWASP | Área | Estado | Evidencia |
|---|---|---|---|
| A01 — Broken Access Control | IDOR / authz multi-tenant | ✅ **remediado** | VULN-008 (members: auth + RBAC + `withRLS`, route.test 9) · VULN-009 (graph: 401 sin sesión, route.test) |
| A03 — Injection | SQLi vía `sql.raw` | ✅ [VERIFIED] | `windowHours` server-controlled (ver §7 research table) |
| A05 — Broken Function Level Auth | Rutas sin autenticación | ✅ **remediado** | VULN-007 (pdf/progress) protegido con sesión |
| A08 — Software & Data Integrity | Deserialización / secrets en bundle | ✅ [VERIFIED] | Service Role nunca en bundle cliente (§3.2) |
| A10 — SSRF | Server-Side Request Forgery | ✅ [VERIFIED] | `assertPublicHostname` + egress-guard (§3.1) |
| A07 — Auth Failures | Dev bypass, fallback de secretos | 🟡 [OBSERVED] | Dev bypass gated por NODE_ENV; `SCAUDIT_WEBHOOK_SECRET` con fallback dev |

---

## 3. Arquitectura (contexto → componentes → dependencias)

```mermaid
flowchart TB
  U[Usuario / Atacante] -->|HTTP| MW[Middleware supabase/ssr]
  MW -->|session| API[API Routes + Server Actions]
  API -->|withRLS| DB[(Supabase Postgres + RLS)]
  API -->|Bearer key| PUB[API Pública /api/public/v1]
  API -->|CRON_SECRET| CRON[Cron jobs]
  API -->|prompt+context| AIR[AI Router OpenRouter]
  AIR -->|respuesta sin escapar| COP[AiCopilot.tsx]
  ADV[Executor Sandbox] -->|safeFetch + egress-guard| NET[Destinos públicos]
  PUB -->|directDb sin RLS| DB
  HIST[API /intelligence/history] -->|directDb sin RLS| DB
```

### 3.1 Dependencias de seguridad

| Componente | Depende de | Riesgo si falla |
|---|---|---|
| `withRLS` (rls.ts) | `SET LOCAL ROLE authenticated` + JWT claims | IDOR multi-tenant |
| `directDb` (db/index.ts) | Uso exclusivo en workers/admin con owner-checks | Bypass de RLS |
| `egress-guard` | DNS lookup + CIDR matching | SSRF |
| `sandbox-executor` | Allowlist de comandos (sin shell) | RCE |
| `AiCopilot` | Sanitización de salida del modelo | DOM XSS |
| `assertPublicHostname` | Listas RFC 1918/reservados | SSRF |

### 3.2 Service Role nunca en bundle cliente — VERIFICADO

- `src/shared/lib/supabase/client.ts` usa SOLO `env.supabaseUrl` + `env.supabaseAnonKey` (NEXT_PUBLIC). **Nunca** importa `admin.ts` [VERIFIED, código leído].
- `src/shared/lib/supabase/admin.ts` (service role) se importa únicamente en server-only code: `env.ts` expone el getter leyendo `process.env.SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_*` → no inline en cliente) [VERIFIED].
- Grep `SUPABASE_SERVICE_ROLE_KEY`: aparece solo en `env.ts`, `admin.ts` y `scripts/setup-admin.ts` (no imprime valor) [VERIFIED]. El health público ya NO lo referencia: `api/public/v1/health` verifica `DATABASE_URL` + `NEXT_PUBLIC_SUPABASE_URL` (la config real; `createAdminClient` no se usa en ninguna ruta) — corrección 2026-08-10 que elimina el 503 `degraded` en producción por `SUPABASE_SERVICE_ROLE_KEY` ausente en Vercel.
- Grep `NEXT_PUBLIC_` en `src/` (24 matches): todas públicas (`SUPABASE_URL`, `PUBLISHABLE_KEY`, `SITE_URL`, `DEV_BYPASS_AUTH`) — ninguna secreta [VERIFIED].
- ✅ **Criterio de aceptación T02-01 §3 cumplido.**

---

## 4. Datos documentados

| Entidad | Columnas críticas | Sensibilidad |
|---|---|---|
| `webhook_configs` | `secret_token` (firma HMAC) | 🔴 Alta — **expuesto en GET (VULN-002)** |
| `developer_api_keys` | `hashed_key` (SHA-256) | 🔴 Alta — hasheado ✅ |
| `intelligence_findings` | `evidence` jsonb | 🔴 Alta — expuesto vía assets/graph sin auth (VULN-005) |
| `intelligence_assets` | `value`, `metadata` | 🔴 Alta — expuesto vía assets/graph sin auth (VULN-005) |
| `dns_history` / `whois_history` | historial por `project_id` | 🔴 Alta — expuesto vía /history sin auth (VULN-004) |
| `web_vitals_logs` | payload RUM | 🟡 Media |
| `security_audit_logs` | ip, userAgent, metadata | 🟡 Media |

---

## 5. Flujos documentados

**Flujo del Copilot (VULN-001):** Usuario escribe prompt → `POST /api/ai/copilot` (auth + rate limit) → `callAIWithFallback` → modelo OpenRouter → respuesta cruda Markdown → `AiCopilot.tsx:151` `dangerouslySetInnerHTML` sin `escapeHtml` → **XSS si el modelo emite HTML**. [VERIFIED]

**Flujo de lectura de webhooks (VULN-002):** `GET /api/webhooks?projectId=X` → `withRLS(user.id)` → `webhookConfigs.findMany` → responde el row completo **incluyendo `secret_token`**. [VERIFIED]

**Flujo de historial sin auth (VULN-004):** Cualquier IP → `GET /api/intelligence/history?projectId=<UUID>` → `withRateLimit` (solo IP, sin sesión) → `queryDnsHistory`/`queryWhoisHistory` sobre `directDb` (bypass RLS) → **datos multi-tenant de cualquier proyecto**. [VERIFIED]

**Flujo del grafo de assets sin auth (VULN-005):** Cualquier IP → `GET /api/intelligence/assets/graph?projectId=<UUID>` → `db.query.intelligenceAssets/findings` (sin `withRLS`, sin owner-check) → **assets + findings de cualquier proyecto**. [VERIFIED]

---

## 6. APIs documentadas — Inventario de 42 rutas

> Inventario completo al commit `739e09d` [VERIFIED, grep `src/app/api/**/route.ts` = 42 archivos].

### 6.1 Autenticadas con sesión (createClient + auth.getUser, o conRLS)

| Ruta | Método | Auth |
|---|---|---|
| `/api/api-keys` | GET/POST/DELETE | sesión + RLS |
| `/api/api-keys/[id]/usage` | GET | sesión + owner-check + rate limit |
| `/api/benchmarking` | GET | sesión |
| `/api/intelligence` | GET/POST | sesión |
| `/api/intelligence/anomalies` | GET | sesión |
| `/api/intelligence/adversary` | GET | sesión |
| `/api/intelligence/brief` | GET | sesión + rate limit |
| `/api/intelligence/copilot` | GET/POST | sesión + rate limit |
| `/api/intelligence/discovery` | GET | sesión |
| `/api/intelligence/drift` | GET | sesión |
| `/api/intelligence/investigations` | GET/POST | sesión + withRLS |
| `/api/intelligence/live` | GET | sesión |
| `/api/intelligence/runs` | GET/POST | sesión |
| `/api/monitoring` | GET | sesión |
| `/api/notifications/push-subscribe` | POST | sesión |
| `/api/plugins` | GET | sesión |
| `/api/projects/[id]/export/keywords` | GET | sesión |
| `/api/security/audit-logs` | GET | sesión |
| `/api/security/siem-alerts` | GET | sesión |
| `/api/reports/pdf` | POST | sesión + rate limit |
| `/api/webhooks` | GET/POST/DELETE | sesión + RLS (⚠️ VULN-002) |
| `/api/ai/report` | POST | sesión + rate limit |
| `/api/ai/copilot` | POST | sesión + rate limit |
| `/api/bulk-scan` | POST | sesión + rate limit |
| `/api/intelligence/health` | GET | sesión opcional (datos limitados anónimos) |

### 6.2 Cron protegido por `CRON_SECRET`

| Ruta | Método | Auth |
|---|---|---|
| `/api/cron/uptime` | GET | `CRON_SECRET` en prod (401 si no coincide) |
| `/api/cron/siem` | GET | `CRON_SECRET` en prod |
| `/api/ai/healthcheck` | GET | `CRON_SECRET` en prod |
| `/api/security/siem/run` | POST | `CRON_SECRET` o sesión |
| `/api/security/siem/test` | POST | `CRON_SECRET` o sesión |

### 6.3 API Pública (API key)

| Ruta | Método | Auth |
|---|---|---|
| `/api/public/v1/intelligence` | GET/POST | API key (hashed) + ownership en POST |
| `/api/looker-studio` | GET | ✅ API key **fail-closed**: 401 si `LOOKER_STUDIO_API_KEY` falta, solo `Bearer` + `timingSafeEqual` (VULN-006 remediado; route.test 2026-09-25) |

### 6.4 Pública por diseño

| Ruta | Método | Nota |
|---|---|---|
| `/api/public/v1/health` | GET | Estado público (booleano de service role, sin valores) |
| `/api/security/csp-report` | POST | 204, intake CSP |
| `/api/telemetry/vitals` | POST | RUM público con zod-validate (rate-limit global fail-open) |
| `/api/auth/validate-email` | POST | Público + rate limit (magic link) |

### 6.5 🔴 SIN AUTENTICACIÓN (hallazgos)

| Ruta | Método | Hallazgo | Severidad |
|---|---|---|---|
| `/api/intelligence/history` | GET | ~~IDOR cross-tenant vía directDb~~ **REMEDIADO** — auth + owner-check (VULN-004) | ~~High~~ Resuelto |
| `/api/intelligence/assets/graph` | GET | ~~IDOR cross-tenant sin RLS~~ **REMEDIADO** — auth + `withRLS` (VULN-005) | ~~High~~ Resuelto |
| `/api/reports/pdf/progress` | GET | ~~SSE sin auth~~ **REMEDIADO** — sesión + clave `pdf_progress:<userId>:<genId>` (VULN-007, TSK-005) | ~~Medium~~ Resuelto |
| `/api/projects/[id]/members` | GET/POST | ~~Mock sin auth~~ **REMEDIADO** — auth + RBAC + `withRLS` (VULN-008, TSK-011) | ~~Low~~ Resuelto |
| `/api/intelligence/graph` | GET | ~~Mock sin auth~~ **REMEDIADO** — 401 sin sesión (VULN-009, TSK-012) | ~~Low~~ Resuelto |
| `/api/webhooks/cicd` | POST | HMAC `verifyWebhookSignature` (correcto en prod; fallback dev) | — |

---

## 7. Seguridad — Hallazgos (VULN)

### VULN-001 — DOM XSS vía salida de IA sin sanitización (High) — REMEDIADO ✅

- **Location:** `src/app/components/AiCopilot.tsx:151`
- **Confidence:** High
- **Issue:** `msg.content` (respuesta del modelo, influenciable por el usuario vía prompt injection) se inyecta con `dangerouslySetInnerHTML`. El replace de markdown se aplica **antes** de cualquier escape. [VERIFIED, código leído]
- **Impact:** Robo de sesión, exfiltración de datos del dashboard.
- **Fix aplicado (TSK-001, P0):** Se aplica `escapeHtml(msg.content)` (helper `report-utils.ts:234`) **ANTES** del replace de markdown. Los `<br/>`/`<strong>` se generan post-escape → el contenido entrante del modelo nunca se renderiza como HTML crudo.
  ```tsx
  <div dangerouslySetInnerHTML={{ __html: escapeHtml(msg.content).replace(/\n/g, '<br/>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
  ```
- **Estado:** Resuelto.

### VULN-002 — Exposición del secreto de firma de webhooks (Medium) — REMEDIADO ✅

- **Location:** `src/app/api/webhooks/route.ts` (GET handler)
- **Confidence:** High
- **Issue:** El GET lista rows completos de `webhook_configs`, incluyendo `secretToken`. [VERIFIED]
- **Fix aplicado (TSK-002, P0):** El GET devuelve `secretTokenPreview` (`whsec_…`, primeros 8 chars) y nunca la clave `secretToken`. Test de regresión añadido (`route.test.ts`).

### VULN-003 — `/intelligence` fuera de las rutas protegidas del middleware (Medium) — REMEDIADO ✅

- **Location:** `src/shared/lib/supabase/middleware.ts` (`isProtectedRoute` solo cubre `/projects`, `/dashboard`, `/settings`)
- **Confidence:** Medium
- **Fix aplicado (TSK-003, P0):** Se añadió `currentPath.startsWith('/intelligence')` a `isProtectedRoute`.

### VULN-004 — IDOR cross-tenant en `/api/intelligence/history` (High) — REMEDIADO ✅

- **Location:** `src/app/api/intelligence/history/route.ts`
- **Confidence:** High
- **Issue (original):** El handler solo pasaba por `withRateLimit` (rate limit por IP, **sin** `authenticate`). Aceptaba `projectId` arbitrario y consultaba `queryDnsHistory` / `queryWhoisHistory` / `getProjectHistoryTimeline`, que operan sobre `directDb` — **bypass total de RLS**. Cualquier atacante con un UUID válido (o fuerza bruta de UUIDs) podía leer el historial DNS/WHOIS de cualquier proyecto. [VERIFIED, código leído]
- **Impact (original):** Fuga cross-tenant de historial de resoluciones DNS/WHOIS y timeline de todos los proyectos.
- **Fix aplicado (commit `fix(b02): remediar IDOR history`):**
  1. `withRateLimit` ahora usa `authenticate` → exige sesión y rate-limita por `user.id` (401 si no hay usuario).
  2. Antes de consultar el historial, verifica ownership del proyecto con `withRLS(user.id)` (`projects.findFirst` por `id`); si no lo posee → 404.
  3. Los readers siguen en `directDb` (necesario para workers de persistencia), pero el acceso ahora está acotado por el owner-check previo.
- **Estado:** Resuelto. Verificado con `pnpm test` (253/253), `pnpm lint` (0 errores) y `pnpm build`.

### VULN-005 — IDOR cross-tenant en `/api/intelligence/assets/graph` (High) — REMEDIADO ✅

- **Location:** `src/app/api/intelligence/assets/graph/route.ts`
- **Confidence:** High
- **Issue (original):** `GET` sin autenticación ni rate limit. Consultaba `db.query.intelligenceAssets` / `intelligenceFindings` por `projectId` **sin** `withRLS` y sin owner-check — como el pool `db` se ejecuta con el rol del `DATABASE_URL` (postgres, superusuario RLS-bypass), exponía assets + findings de cualquier proyecto. [VERIFIED, código leído]
- **Impact (original):** Fuga cross-tenant de assets descubiertos, metadata y hallazgos (severidades, evidencia).
- **Fix aplicado (commit `fix(b02): remediar IDOR assets/graph`):**
  1. `createClient()` + `auth.getUser()` → 401 si no hay sesión.
  2. Ambas queries envueltas en `withRLS(user.id)` → RLS aísla el acceso por proyecto.
- **Estado:** Resuelto. Verificado con `pnpm test` (253/253), `pnpm lint` (0 errores) y `pnpm build`.

### VULN-006 — Auth condicional en `/api/looker-studio` (Medium) — REMEDIADO ✅

- **Location:** `src/app/api/looker-studio/route.ts` (líneas 74-86)
- **Confidence:** High
- **Issue:** Si `LOOKER_STUDIO_API_KEY` **no está definida** en el entorno, el bloque de autorización se salta por completo (queda solo rate-limit por IP). Además el API key se acepta por **query param** (`?apiKey=`), filtrándose en logs/analytics/referrers. [VERIFIED, código leído]
- **Impact:** Endpoint de datos de negocio (GSC/GA4) accesible sin credencial si la env var falta; key en URLs.
- **Fix aplicado (TSK-004, P0):** Fail-closed (401 si la env var no existe), solo `Authorization: Bearer`, comparación con `crypto.timingSafeEqual`, y eliminado el query param `apiKey`.

### VULN-007 — SSE de progreso de PDF sin auth (Medium) — REMEDIADO ✅

- **Location:** `src/app/api/reports/pdf/progress/route.ts`
- **Confidence:** High
- **Issue:** `GET /api/reports/pdf/progress?genId=<id>` es público. `genId` es un UUID generado por el cliente (o aleatorio) de ≥8 chars; al ser adivinable/determinista, un atacante puede observar el progreso de generación de PDFs ajenos. [VERIFIED, código leído]
- **Impact:** Fuga de metadatos de generación (percent, step, errores); DoS leve por conexiones SSE abiertas.
- **Fix aplicado (TSK-005, P0):** El GET exige sesión (`createClient().auth.getUser()` → 401 sin sesión). La clave Redis ahora es `pdf_progress:<userId>:<genId>` (namespaced por usuario) tanto en el POST (`reports/pdf/route.tsx`) como en el GET — un caller solo puede ver el progreso de sus propias generaciones.
- **Actualización 2026-09-27:** se eliminó Upstash; el progreso vive en la tabla Postgres `pdf_progress` con PK compuesta (`userId`, `genId`) + RLS `user_id = auth.uid()`. El aislamiento por usuario se conserva (ahora por RLS y no por nombre de clave).

### VULN-008 — Endpoint de miembros sin auth (Low, mock) — REMEDIADO ✅

- **Location:** `src/app/api/projects/[id]/members/route.ts`
- **Confidence:** High (solo datos mock)
- **Issue:** GET/POST sin autenticación; devuelve emails/roles hardcodeados y "crea" invitaciones sin verificar nada. Hoy son datos falsos, pero es superficie sin auth que deberá bloquearse al conectar DB. [VERIFIED, código leído]
- **Impact:** Nulo hoy (mock); riesgo futuro si se conecta a datos reales sin auth.
- **Fix aplicado (TSK-011):** auth de sesión (`401` sin sesión) + RBAC + lectura real vía `withRLS` — verificado con `route.test.ts` (9 tests) el 2026-09-24.

### VULN-010 — Fugas de datos a terceros vía CDNs/recursos externos (Medium) — REMEDIADO ✅

- **Location:** `src/app/components/GeoMap.tsx` (markers unpkg + tiles CartoCDN) · `public/scripts/vitals.js` (web-vitals unpkg) · `src/shared/utils/exportPdf.ts` / `exportIntelligencePdf.ts` / `src/app/components/report-utils.ts` (Google Fonts)
- **Confidence:** High [VERIFIED, código leído + grep]
- **Issue:** Cuatro puntos contactaban terceros desde el navegador del usuario final:
  1. **GeoMap → `basemaps.cartocdn.com`** (tiles) — **el más grave**: cada vista del mapa de inteligencia revela a CartoDB la IP del analista y la **región geográfica consultada** (geolocalización del área de investigación).
  2. **GeoMap → `unpkg.com`** (markers de Leaflet) — IP + Referer del analista.
  3. **vitals.js → `unpkg.com`** (web-vitals) — IP + Referer de cada visitante del sitio del cliente que inserta el snippet RUM.
  4. **Export de PDFs/reportes → `fonts.googleapis.com`** — IP + Referer del usuario en cada export (los PDFs se generan en el navegador).
  El CSP los permitía parcialmente: `img-src 'self' data: https:` habilitaba los tiles/markers; `script-src` con `strict-dynamic` habilitaba el script dinámico de unpkg; los `@import`/`<link>` de Google Fonts se resolvían en el contexto del export.
- **Impact:** Exposición de IP, User-Agent, Referer (mitigado a origin por `Referrer-Policy: strict-origin-when-cross-origin`) y —crítico en ciberseguridad— la **zona geográfica que el analista está investigando** a terceros.
- **Fix aplicado (auditoría 2026-08-09):**
  1. **GeoMap:** markers self-hosted (`/vendor/leaflet/*.png` desde `node_modules/leaflet`) + tiles de CartoCDN **reemplazados por una cuadrícula local** (meridianos/paralelos + pane `grid`, estética SOC del design system) — **cero peticiones a terceros** al abrir el mapa.
  2. **vitals.js:** web-vitals self-hosted (`/vendor/web-vitals.iife.js`, URL derivada del origin del propio snippet) — sin unpkg.
  3. **PDFs/reportes:** Google Fonts eliminado → font stack de sistema (Inter/JetBrains fallback), sin `@import` ni `<link>` externo.
- **Estado:** Resuelto. Verificado con grep (0 referencias activas a `unpkg`/`cartocdn`/`fonts.googleapis` en src+public, salvo el snippet de ejemplo Nginx que es texto de ayuda). Nota residual resuelta: `docs/html/*.html` y `docs/scaudit-documentacion-unificada.html` usaban mermaid desde `cdn.jsdelivr.net` — self-hosted en `docs/vendor/mermaid.min.js` (mismo bundle v11, copiado de `node_modules`). 0 referencias activas a CDNs de terceros en todo el repo.

### Hallazgos investigados y NO reportados (HIGH-confidence research)

| Patrón | Verificación | Resultado |
|---|---|---|
| `anomaly/detector.ts:167` `sql.raw(String(windowHours))` | `windowHours` = 24 hardcodeado desde `anomaly.trigger.ts` (server-controlled) | ✅ Seguro |
| `directDb` en audits.ts / api-keys usage | Owner checks `ownerId !== userId` / ownership → 403 | ✅ Seguro |
| `sandbox-executor.ts` | Sin `child_process`, allowlist curl/nc/nmap, egress-guard + timeouts | ✅ Seguro |
| `MermaidBlock.tsx:84` `dangerouslySetInnerHTML` SVG | `securityLevel: 'strict'` (sanitización de mermaid) | ✅ Seguro |
| `AttackSurfaceGraph.tsx:80` `<style>` | CSS estático sin interpolación de input | ✅ Seguro |
| `playground/page.tsx:373` highlight | `escapeHtml(text)` **antes** del highlight | ✅ Seguro |
| Webhook POST SSRF | `assertPublicHostname` en la URL del webhook | ✅ Seguro |
| `api-auth.ts` / `api-keys.ts` hashing | SHA-256 de key 256-bit aleatoria; lookup por hash indexado | ✅ Seguro |
| CSP (`proxy.ts`) | HSTS + X-Frame-Options DENY + nosniff + CSP con nonce por request (`script-src 'self' 'nonce-…' 'strict-dynamic'` sin `unsafe-inline`), `object-src 'none'`, `connect-src 'self' https://*.supabase.co`, meta CSP espejo con el mismo nonce en `layout.tsx` | ✅ Seguro |
| Dev bypass auth | Gateado por `NODE_ENV === 'development'` | ✅ Seguro |
| `/api/public/v1/intelligence` POST | API key + `eq(projects.ownerId, userId)` antes de insertar | ✅ Seguro |
| `webhooks/cicd` | HMAC `crypto.timingSafeEqual` + prefijo `sha256=` | ✅ Seguro (ver fallback dev en §14) |
| `/api/security/csp-report` | Intake público por diseño (204), sin datos sensibles | ✅ Seguro |
| `/api/telemetry/vitals` | Público por diseño; zod-validate + rate-limit global fail-open | ✅ Seguro |

---

## 8. Testing documentado

| Capa | Estrategia | Estado |
|---|---|---|
| Unit (executors, egress-guard, ratelimit) | Vitest — 248 tests verdes (baseline B00) | ✅ |
| RLS / multi-tenancy | `src/shared/db/rls.test.ts` — contract test: claims distintos por usuario, `set_config` + `SET LOCAL ROLE authenticated` | ✅ NUEVO (T02-03) |
| E2E (Playwright) | Login, dashboard, reporte IA | ✅ |
| Security regression (propuesto) | Test que verifica `AiCopilot` nunca inyecta HTML crudo | 🔴 Pendiente (REQ-001) |
| Security regression (propuesto) | Test que 401/403 en `/intelligence/history` y `/assets/graph` sin sesión | 🔴 Pendiente (REQ-006) |

---

## 9. Deployment documentado

| Item | Valor |
|---|---|
| Ambientes | Vercel (prod) + local dev con bypass auth explícito |
| CI/CD | GitHub Actions: lint-and-build, test-and-coverage, api-contract-test, docs-quality-gate, **secret-scan (gitleaks)** — NUEVO (T02-04) |
| Secrets | Env vars en Vercel; `CRON_SECRET` para cron protegido; `SCAUDIT_WEBHOOK_SECRET` para webhooks |
| Env matrix | `docs/guides/ENVIRONMENT-MATRIX.md` — NUEVO (T02-04) |

---

## 10. Operaciones documentadas

| Item | Valor |
|---|---|
| Monitoring | Healthcheck de modelos IA cada 6h; SIEM exporter de security_audit_logs |
| Runbooks | `docs/guides/troubleshooting.md`, `docs/guides/deployment.md` |
| Recovery | Reporte resiliente sin IA + fallback chain de modelos |
| Auditoría de seguridad | `security_audit_logs` (api_key_usage, RLS violations, SIEM) |

---

## 11. Diagramas (mermaid)

Ver §3 (arquitectura) — 1 bloque mermaid, 11 nodos, válido.

---

## 12. Inventario visual

| ID | Figura | Tipo | Nivel |
|---|---|---|---|
| FIG-001 | Arquitectura de seguridad (contexto → componentes, incl. flujos directDb) | Diagram | L2 |

---

## 13. Trazabilidad (REQ → COMP → TEST → DEP)

| REQ | COMP | TEST | DEP |
|---|---|---|---|
| REQ-001 | AiCopilot.tsx + report-utils.escapeHtml | Security regression propuesto | Vercel |
| REQ-002 | webhooks/route.ts (GET) | Manual | Vercel |
| REQ-003 | middleware.ts | E2E login | Vercel |
| REQ-004 | rls.ts + owner checks | `rls.test.ts` (T02-03) | Vercel |
| REQ-005 | sandbox-executor + egress-guard | e2e-adversary-flow | Vercel |
| REQ-006 | history/assets-graph → fix pendiente | Security regression propuesto | Vercel |
| REQ-007 | gitleaks en CI + `.env.example` | `secret-scan` job (T02-04) | GitHub Actions |

---

## 14. Cross-check / inconsistencias

**DOCUMENTATION CONSISTENCY ISSUE (NUEVO, OBSERVED)** — `src/shared/hooks/useRealtimeMetrics.ts:12` lee `NEXT_PUBLIC_SUPABASE_ANON_KEY`, pero `.env.example` y el resto del código documentan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Si solo se define la variante documentada, el hook recibe `''` y el realtime se degrada en silencio (los canales no reciben eventos). No es un hallazgo de seguridad, pero es una inconsistencia de env [VERIFIED]. Ver `docs/guides/ENVIRONMENT-MATRIX.md`.

**DOCUMENTATION CONSISTENCY ISSUE (de v1.0, re-verificado)** — `DB_OPTIMIZATION_REPORT.md` declara `idx_developer_api_keys_hashed (UNIQUE)`; el schema `monitoring.ts` declara `uniqueIndex` y la migración 0019 `CREATE UNIQUE INDEX` → **consistente** ✅.

**INCONSISTENCIA OBSERVED** — `src/shared/config/env.ts` usa el nombre `Bearer_API_KEY` (camel-case inusual) y `XIAOMI_BASE_URL` con default `https://apifreellm.com/api/v1/chat` (nombre "XIAOMI" vs productor LLM). Renombrar a `BEARER_API_KEY` y revisar el default en B04.

**INCONSISTENCIA OBSERVED** — `webhooks/cicd` usa `SCAUDIT_WEBHOOK_SECRET` con fallback `"default_webhook_secret_for_dev"` cuando NODE_ENV no es producción; si CI/dev se despliega con ese default en un entorno no controlado, las firmas son triviales. Verificar que prod siempre defina el secret.

---

## 15. Unknowns y assumptions

| Item | Clasificación |
|---|---|
| Impacto real de VULN-003 (qué datos filtra el shell de /intelligence sin sesión) | [ASSUMPTION] |
| Políticas RLS exactas que gobiernan lectura de `webhook_configs` en roles viewer | [UNKNOWN] |
| Modelo de amenazas para el módulo adversary (PTT) | [PROPOSED] — ver THREAT-REGISTER.md |
| Severidad real de VULN-004/005 en prod (¿existen UUIDS enumerables?) | [ASSUMPTION] — los UUIDv4 no son enumerables por fuerza bruta, pero el riesgo existe si se comparten/leakean IDs |
| ¿`LOOKER_STUDIO_API_KEY` está definida en todos los entornos Vercel? | [UNKNOWN] — si no, VULN-006 es activo en prod |

---

## 16. Fuentes

| Dato | Fuente |
|---|---|
| Línea exacta de `dangerouslySetInnerHTML` (AiCopilot.tsx:151) | [VERIFIED] código leído |
| 42 rutas `src/app/api/**/route.ts` | [VERIFIED] grep |
| `/intelligence/history` sin `authenticate`, con directDb | [VERIFIED] código leído |
| `/assets/graph` sin auth y sin withRLS | [VERIFIED] código leído |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` en useRealtimeMetrics:12 | [VERIFIED] código leído |
| 248 tests verdes | [VERIFIED] vitest run (baseline B00) |
| `windowHours` constante en trigger | [VERIFIED] código leído |
| OWASP Cheat Sheets | [SOURCE: DOCS] cheatsheetseries.owasp.org |
| STRIDE (assets/actores/controles) | [SOURCE: DOCS] THREAT-REGISTER.md |

---

## 17. Glosario

| Término | Definición |
|---|---|
| IDOR | Insecure Direct Object Reference — acceso a recurso por ID sin verificar ownership |
| SSRF | Server-Side Request Forgery — abuso del servidor para alcanzar redes internas |
| RLS | Row Level Security — policies de Postgres por usuario autenticado |
| Allowlist | Lista blanca de comandos permitidos (sandbox) |
| Prompt injection | Manipulación del prompt para alterar la salida del modelo |
| directDb | Pool de conexión directo (DATABASE_URL) que bypassa RLS — solo workers/admin |
| SSE | Server-Sent Events — stream unidireccional HTTP |

---

## 18. Resumen ejecutivo

**Conclusión histórica de v2.4 (2026-08-09):** la afirmación “0 hallazgos abiertos” reflejaba aquel baseline y no describe el checkout actual. No debe interpretarse como certificación vigente. La revisión actual, resultados y prioridades se documentan en §19. Los cierres de VULN-001..010 y el guard de secretos en CI son controles previos, no sustituyen este análisis.

---

## 19. Revisión estática del checkout — 2026-10-29

### 19.1 Alcance, método y límites

Revisión del código actual enfocada en dependencias, SSRF/egress, autenticación y autorización, exposición de datos, RLS/grants, manejo de secretos y controles CI. Se contrastaron rutas API y workers con los módulos de seguridad y migraciones; se ejecutaron los guards disponibles y un conjunto de pruebas de regresión. No se enviaron peticiones a producción ni a dominios de clientes, no se consultó la base de datos alojada, no se ejecutó gitleaks sobre el historial y no se dispone de evidencia de configuración real de Vercel/Supabase. Por ello, el alcance es estático/local y no equivale a una prueba de penetración ni prueba explotación en el despliegue.

### 19.2 Hallazgos vigentes priorizados

| ID | Prioridad | Hallazgo y evidencia actual | Impacto / confianza | Acción recomendada |
|---|---|---|---|---|
| AUD-2026-01 | **Crítica — dependencia** | `next@16.3.3` está por debajo de las versiones corregidas indicadas por el audit: RCE en `next/og` (parche desde 16.3.6), procesamiento de SVG del optimizador de imágenes y fallos en funciones `use cache` con typed arrays (parches desde 16.4.1). No se encontró uso de `ImageResponse`/`next/og` ni `use cache`; la configuración de imágenes no habilita SVG ni remotos, lo que reduce la evidencia de alcanzabilidad pero no elimina la dependencia vulnerable. | Probabilidad condicionada a que rutas/funciones afectadas sean alcanzables; la versión instalada y los advisories son confirmados, no se demostró explotación. | Actualizar Next.js a la última versión corregida compatible y actualizar lockfile. Volver a ejecutar audit, build y pruebas tras la actualización. |
| AUD-2026-02 | **Alta — SSRF/egress** | `getWithCapture` en los checks de evaluación usa `fetch(..., { redirect: "follow" })`; esto sigue redirecciones automáticamente desde URLs de destino controladas por el proyecto, sin que el egress guard pueda revalidar cada salto. Además, la resolución/validación DNS no fija la conexión a la IP verificada, dejando ventana de DNS rebinding. | Elude controles de defensa ante destinos privados en redirecciones/rebinding. El patrón de código está confirmado; explotación efectiva depende de resolución DNS y entorno del worker. | Desactivar redirecciones automáticas para checks. Seguir manualmente cada salto con validación de esquema, hostname, IP y límite de saltos; fijar IP validada o aplicar egress de red. Añadir pruebas específicas sobre `getWithCapture`. |
| AUD-2026-03 | **Alta — SSRF y posible fuga de credenciales** | `/api/bulk-scan` deriva el origen de un self-fetch de `req.nextUrl.origin` y reenvía `Cookie` y `Authorization` capturados de la petición al endpoint interno. | Si el proxy acepta Host controlado por el cliente, el servidor puede reenviar credenciales a ese origen. Código confirmado; exploitabilidad depende del manejo de Host del despliegue, no verificado aquí. | Fijar el origen a configuración confiable o reemplazar self-fetch por llamada interna; no reenviar credenciales al origen derivado de request. Verificar con Host-header test en staging. |
| AUD-2026-04 | **Alta — dependencias de producción** | `pnpm audit` reportó advisories críticos/altos en dependencias directas y transitivas de producción, incluyendo `dompurify`, `axios`, `follow-redirects`, `zod`, `sharp`, `source-map-js` y `systeminformation`. Algunos advisories aplican a usos/configuraciones concretos y la presencia de un advisory no demuestra que el vector sea alcanzable. | Riesgo de cadena de suministro confirmado por el audit; alcance de explotación no demostrado. | Actualizar a releases corregidos compatibles; priorizar dependencias alcanzables en producción, conservar lockfile y volver a ejecutar auditoría y pruebas. |
| AUD-2026-05 | **Media — autorización/telemetría global** | `/api/ai/status` requiere sesión, pero consulta `ai_health_logs` mediante `directDb` sin comprobar que el usuario sea platform admin. La migración configura policy `ai_health_logs_admin`; el acceso directo evita esa policy y expone métricas agregadas globales a usuarios autenticados. | Exposición cross-tenant de estado y latencia de proveedores/modelos; no se observa devolución de secretos en los campos seleccionados. Confirmado en el código. | Aplicar autorización admin en la ruta o acceder con rol/RLS que respete la policy; si es intencional para todos, publicar solo un agregado explícitamente aprobado. |
| AUD-2026-06 | **Media — carrera de autorización en assessment** | La ruta de creación comprueba `activeTestingAuthorized`, pero `executeAssessment` carga assessment/proyecto y lanza `runRealAssessment` sin volver a comprobar consentimiento actual ni comparar `assessment.target` con el dominio vigente del proyecto. | Un consentimiento revocado o un dominio cambiado mientras el trabajo está en cola no cancela necesariamente la ejecución previamente autorizada. Defecto confirmado; ventana operativa depende del scheduling. | En el worker, comprobar inmediatamente antes del egress que el proyecto sigue activo, el consentimiento sigue vigente y el destino coincide con el dominio autorizado; cubrir la revocación en tests. |
| AUD-2026-07 | **Media — grants residuales en base de datos** | El guard de grants heredados registra 52 tablas con privilegios `DELETE`/`TRIGGER`/`REFERENCES` conservados en el baseline. El guard pasa frente a nuevas regresiones, pero no valida que esos grants sean necesarios. | Superficie de privilegio excesivo confirmada por baseline local; no demuestra por sí sola una ruta explotable ni refleja necesariamente el estado actual de la base alojada. | Contrastar grants con staging, retirar los que no sean necesarios por rol, verificar impacto funcional y mantener el control anti-regresión. |

### 19.3 Controles ejecutados y límites

| Control | Resultado |
|---|---|
| `pnpm guard:secrets` | PASS: guard de separación server/client. No es escaneo de historial ni reemplaza gitleaks. |
| `pnpm db:rls-surface-guard` | PASS: no detectó cambio en el baseline de superficies de acceso; el conteo no certifica cada autorización. |
| `pnpm rls:inventory` | PASS con observaciones: RLS detectada en 78 tablas; 8 sin policies están clasificadas como fail-closed; queda una discrepancia documentada de `project_members`. |
| `pnpm db:inherited-grants-guard` | PASS contra cambios nuevos; 52 tablas siguen en baseline de grants heredados. |
| Pruebas focalizadas | El intento de ejecutar en conjunto 5 archivos (egress, `/api/ai/status`, `/api/bulk-scan`) excedió el límite de 10 minutos y no se confirmó su resultado. Sí pasó `pnpm exec vitest run src/server/intelligence/security/egress-follow.test.ts` (4 pruebas). Las pruebas existentes no cubren el bypass de `getWithCapture` descrito arriba. |
| `pnpm audit --json` | FAIL (exit 1): 71 advisories únicos (5 critical, 26 high, 30 moderate, 10 low); 4 critical y 16 high afectan dependencias marcadas como producción. Advisories no equivalen automáticamente a explotación. |

La ruta adversaria revisada exige autenticación, permiso `scan:execute`, consentimiento para crear la tarea y acceso al proyecto. No se confirmó acceso anónimo en ese flujo. No se probaron las configuraciones reales de Vercel/Supabase, ni se realizaron escaneos de producción o de dominios de terceros. Tampoco se ejecutó gitleaks sobre historial completo.

### 19.4 Prioridad de remediación

1. Actualizar Next.js y dependencias vulnerables en producción; repetir audit, build y pruebas.
2. Cerrar el seguimiento automático y DNS rebinding en egress, validando cada salto.
3. Eliminar el origen derivado de la petición y el reenvío de credenciales en `/api/bulk-scan`.
4. Respetar la policy admin en `/api/ai/status` y revalidar consentimiento/dominio en el worker de assessment.
5. Auditar grants contra staging y ejecutar escaneo de secretos del historial completo antes de declarar la postura del despliegue.

**Estado:** hallazgos reportados, sin remediación de código en esta revisión; pendiente verificación del entorno desplegado.
