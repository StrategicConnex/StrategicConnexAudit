# OBSERVABILITY-MATRIX — StrategicAudit Pro

**B08 / TSK-020 / REQ-116** · Creado: 2026-09-25 · Actualizado: 2026-09-27 · Estado: **G1–G3 implementados y verificados**

Inventario de señales de observabilidad y convención de identificadores. Todo lo marcado `[VERIFIED]` se contrastó contra código (última pasada: 2026-09-27, `npx tsc --noEmit` + suite Vitest en verde).

---

## 1. Convención de IDs

| ID | Definición | Generación | Propagación | Estado |
|----|-----------|------------|-------------|--------|
| `requestId` | Identificador único de una request HTTP | `crypto.randomUUID()` en `src/proxy.ts:103` | Header `x-request-id` (request, `proxy.ts:123`) y `X-Request-Id` (response, `proxy.ts:135`) | ✅ **ACTIVO** [VERIFIED] |
| `jobId` | Run id de un job Trigger.dev | Plataforma (dashboard de Trigger.dev) | Solo en logs de Trigger.dev; **no** propagado a la app | ⚠️ **PARCIAL** (limitación de plataforma) |
| `correlationId` | Enlaza request → job → export SIEM para trazar un hallazgo de extremo a extremo | `currentCorrelationId()` en `src/lib/request-context.ts:43` (cae a `requestId`) | Payloads Trigger.dev (`correlationId?`) + export SIEM + cabecera `x-request-id` saliente | ✅ **ACTIVO** (G2) [VERIFIED] |

**Regla vigente (implementada):**
1. El proxy pobla el ALS con `runWithRequestContext({ requestId }, ...)` → todo `logger.*` dentro de la request fusiona `context.requestId`.
2. Cada route handler entra al scope con `withRequestContext(rawGet/rawPost)` (o con los wrappers que ya poblaban el scope: `withRateLimit`, `withPublicApi`).
3. Los jobs de Trigger.dev que nacen en una request reciben `correlationId` en el payload y el `run` lo re-puebla con `runWithCorrelation(payload.correlationId, ...)` → el worker loguea el mismo id.
4. El export SIEM incluye `correlationId` en el patrón exportado (`SiemPattern.correlationId`) y en la cabecera saliente.

---

## 2. Matriz de señales

| # | Señal | Implementación | Evidencia | Estado |
|---|-------|----------------|-----------|--------|
| 1 | Request ID (entrada/salida) | Proxy Next.js 16 genera UUID y lo devuelve en header | `src/proxy.ts:103,123,135` | ✅ ACTIVO [VERIFIED] |
| 2 | Logger estructurado JSON | `logger.debug/info/warn/error` con contexto; `createChildLogger` para módulos; salida a consola compatible con Vercel Logs/Datadog | `src/lib/logger.ts`, tests `src/lib/logger.test.ts` | ✅ ACTIVO [VERIFIED] |
| 3 | Contexto request-scoped (ALS) | `AsyncLocalStorage<{requestId,userId,correlationId}>` en el logger; `proxy.ts` lo popula (G1) y `withRequestContext` lo re-puebla por handler | `src/lib/logger.ts`, `src/proxy.ts:106-110`, `src/lib/request-context.ts` | ✅ **ACTIVO** (antes: infra sin uso) [VERIFIED] |
| 4 | RUM / Web Vitals | Beacon cliente `public/scripts/vitals.js` → `POST /api/telemetry/vitals` (token + schema zod) → tabla `web_vitals_logs` → agregación `computeVitalsAverages` → limpieza diaria | `src/app/api/telemetry/vitals/route.ts`, `src/shared/db/schemas/index.ts`, `src/shared/utils/rum.ts`, `src/trigger/cleanup.trigger.ts` | ✅ ACTIVO [VERIFIED] |
| 5 | Health checks | `GET /api/ai/healthcheck` (salud de proveedores AI; requiere 2 días healthy para recuperar), `GET /api/monitoring`, `GET /api/public/v1/health` | `src/app/api/ai/healthcheck/route.ts`, `src/server/ai/ai-router.ts` | ✅ ACTIVO [VERIFIED] |
| 6 | Cron / Uptime | `GET /api/cron/uptime` + `GET /api/cron/siem` con auth fail-closed (401 sin secreto) | `src/server/auth/cron.ts` | ✅ ACTIVO [VERIFIED] |
| 7 | SIEM | Export de eventos de seguridad + `/api/security/siem-alerts` + cron; `correlationId` en patrones y payloads | `src/server/security/siem-exporter.ts` | ✅ ACTIVO — **`correlationId` resuelto (G2)** |
| 8 | Audit trail | Tablas `audit_logs` + `security_audit`; lectura admin `GET /api/security/audit-logs` (`requireAdmin`) | `src/app/api/security/audit-logs/route.ts` | ✅ ACTIVO [VERIFIED] |
| 9 | Errores de route handler | `try/catch` + `logger.error` + `getErrorMessage` en rutas core | `src/shared/lib/errors.ts`, rutas intelligence/* | ✅ ACTIVO [VERIFIED] |
| 10 | Jobs Trigger.dev | Logs + dashboards por job, `retry` explícitos, 21+ triggers; payloads con `correlationId` | `src/trigger/*.trigger.ts` | ✅ ACTIVO — **correlación con app resuelta (G2)** |
| 11 | APM externo (Sentry/Datadog/NewRelic) | **No instalado** (grep sin dependencias; solo apariciones en wordlists de discovery) | — | ➖ N/A (decisión: sin APM de terceros) |
| 12 | Propagación saliente (G3) | `correlatedHeaders(base)` añade `x-request-id` a los fetch de proveedores de confianza | `src/lib/request-context.ts:65` | ✅ ACTIVO [VERIFIED] |

---

## 3. Gaps identificados (prioridad)

| # | Gap | Impacto | Esfuerzo | Estado |
|---|-----|---------|----------|--------|
| G1 | ~~El ALS del logger existe pero nadie lo popula~~ | — | S | ✅ **RESUELTO** — `proxy.ts` + `withRequestContext` en todos los handlers |
| G2 | ~~`correlationId` no existe en payloads de Trigger.dev ni en el export SIEM~~ | — | M | ✅ **RESUELTO** — payloads + `SiemPattern.correlationId` |
| G3 | ~~`x-request-id` no se propaga a fetch salientes~~ | — | S | ✅ **RESUELTO** — `correlatedHeaders()` en los fetch de confianza |
| G4 | Sin APM externo: los errores de producción dependen solo de Vercel Logs | Sin alerts/trends | M (coste/decisión) | ⏳ ABIERTO (decisión humana) |

### Cobertura de G3 (fetch salientes con `x-request-id`)

| Destino | Archivo |
|---------|---------|
| OpenRouter (AI router) | `src/server/ai/ai-router.ts` |
| Anthropic (failover) | `src/server/ai/providers.ts` |
| Resend (invitaciones) | `src/server/lib/invitations.ts` |
| Resend + Telegram (digest semanal) | `src/server/security/weekly-digest.ts` |
| Canales SIEM (Slack/PagerDuty/Splunk/Email) | `src/server/security/siem-exporter.ts` |
| Slack / Teams (alertas de proyecto) | `src/server/integrations/{slack,teams}/client.ts` |
| Webhooks de cliente | `src/trigger/webhook.trigger.ts` |

**No se propaga a propósito:** egress-guard, crawler y checks de assessment/uptime (objetivos de terceros auditados; no son proveedores de confianza).

---

## 4. Criterios de aceptación TSK-020

- [x] Matrix de señales inventariada y verificada contra código → **este documento**
- [x] Convención de IDs documentada (§1)
- [x] Correlation IDs implementados en proxy/triggers/SIEM (§1, §2 #12, §3 G1–G3)
- [x] Tests de regresión: `src/lib/request-context.test.ts` (18 casos: G1 wrapper/ALS, G2 scope, G3 headers)

**Fuentes primarias:** `src/proxy.ts` · `src/lib/logger.ts` · `src/lib/request-context.ts` · `src/server/security/siem-exporter.ts` · `src/app/api/telemetry/vitals/route.ts` · `scripts/quality-gate.mjs`
