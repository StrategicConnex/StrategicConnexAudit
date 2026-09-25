# OBSERVABILITY-MATRIX — StrategicAudit Pro

**B08 / TSK-020 / REQ-116** · Creado: 2026-09-25 · Estado: **Matrix + convención publicados** (implementación de correlation IDs pendiente de aprobación)

Inventario de señales de observabilidad y convención de identificadores. Todo lo marcado `[VERIFIED]` se contrastó contra código el 2026-09-25.

---

## 1. Convención de IDs

| ID | Definición | Generación | Propagación actual | Estado |
|----|-----------|------------|--------------------|--------|
| `requestId` | Identificador único de una request HTTP | `crypto.randomUUID()` en `src/proxy.ts:102` | Header `x-request-id` (request, `proxy.ts:108`) y `X-Request-Id` (response, `proxy.ts:120`) | ✅ **ACTIVO** [VERIFIED] |
| `jobId` | Run id de un job Trigger.dev | Plataforma (dashboard de Trigger.dev) | Solo en logs de Trigger.dev; **no** propagado a la app | ⚠️ **PARCIAL** |
| `correlationId` | Enlaza request → job → export SIEM para trazar un hallazgo de extremo a extremo | — | **No implementado** | ❓ **PENDIENTE** (requiere decisión) |

**Regla acordada (esta matrix):**
1. Todo handler de route puede leer `requestId` desde `req.headers.get("x-request-id")` y debe incluirlo en `context` al llamar a `logger.*`.
2. Los jobs de Trigger.dev deben recibir `requestId`/`correlationId` en el payload cuando se disparen desde una request.
3. El export SIEM debe incluir el `correlationId` del evento que originó el hallazgo.

---

## 2. Matriz de señales

| # | Señal | Implementación | Evidencia | Estado |
|---|-------|----------------|-----------|--------|
| 1 | Request ID (entrada/salida) | Proxy Next.js 16 genera UUID y lo devuelve en header | `src/proxy.ts:102,108,120` | ✅ ACTIVO [VERIFIED] |
| 2 | Logger estructurado JSON | `logger.debug/info/warn/error` con contexto; `createChildLogger` para módulos; salida a consola compatible con Vercel Logs/Datadog | `src/lib/logger.ts:39-105`, tests `src/lib/logger.test.ts` | ✅ ACTIVO [VERIFIED] |
| 3 | Contexto request-scoped (ALS) | `AsyncLocalStorage<{requestId,userId}>` disponible en el logger y mergeado en cada entrada de log | `src/lib/logger.ts:21-33,48-52` | ⚠️ **INFRA SIN USO**: ningún call site invoca `requestContext.run()` → el store nunca se popula |
| 4 | RUM / Web Vitals | Beacon cliente `public/scripts/vitals.js` → `POST /api/telemetry/vitals` (token + schema zod) → tabla `web_vitals_logs` → agregación `computeVitalsAverages` → limpieza diaria | `src/app/api/telemetry/vitals/route.ts`, `src/shared/db/schemas/index.ts:469`, `src/shared/utils/rum.ts:45`, `src/trigger/cleanup.trigger.ts:39` | ✅ ACTIVO [VERIFIED] |
| 5 | Health checks | `GET /api/ai/healthcheck` (salud de proveedores AI; requiere 2 días healthy para recuperar), `GET /api/monitoring`, `GET /api/public/v1/health` | `src/app/api/ai/healthcheck/route.ts`, `src/server/ai/ai-router.ts:151` | ✅ ACTIVO [VERIFIED] |
| 6 | Cron / Uptime | `GET /api/cron/uptime` + `GET /api/cron/siem` con auth fail-closed (401 sin secreto) | `src/server/auth/cron.ts:25-30` | ✅ ACTIVO [VERIFIED] |
| 7 | SIEM | Export de eventos de seguridad + `/api/security/siem-alerts` + cron | `src/app/api/security/siem*/route.ts` | ✅ ACTIVO — ⚠️ **sin `correlationId`** |
| 8 | Audit trail | Tablas `audit_logs` + `security_audit`; lectura admin `GET /api/security/audit-logs` (`requireAdmin`) | `src/app/api/security/audit-logs/route.ts:5,14` | ✅ ACTIVO [VERIFIED] |
| 9 | Errores de route handler | `try/catch` + `logger.error` + `getErrorMessage` en rutas core | `src/shared/lib/errors.ts`, rutas intelligence/* | ✅ ACTIVO [VERIFIED] |
| 10 | Jobs Trigger.dev | Logs + dashboards por job, `retry` explícitos, 21+ triggers | `src/trigger/*.trigger.ts` | ✅ ACTIVO (plataforma) — ⚠️ `jobId` no correlaciona con logs de app |
| 11 | APM externo (Sentry/Datadog/NewRelic) | **No instalado** (grep sin dependencias; solo apariciones en wordlists de discovery) | — | ➖ N/A (decisión: sin APM de terceros) |

---

## 3. Gaps identificados (prioridad)

| # | Gap | Impacto | Esfuerzo | Referencia |
|---|-----|---------|----------|-----------|
| G1 | El ALS del logger existe pero nadie lo popula (`requestContext.run` sin call sites) → `requestId`/`userId` **no aparecen** en los logs JSON | Baja endev, media en prod (imposible correlacionar logs de una request) | S | `src/lib/logger.ts:22-33` |
| G2 | `correlationId` no existe en payloads de Trigger.dev ni en el export SIEM | No se puede trazar request→job→SIEM | M | TSK-020 |
| G3 | `x-request-id` no se propaga a fetch salientes (proveedores AI, APIs externas) | Pérdida de trazabilidad en llamadas externas | S | — |
| G4 | Sin APM externo: los errores de producción dependen solo de Vercel Logs | Sin alerts/trends | M (coste/decisión) | — |

**Decisión pendiente (Humano):** implementar G1–G3 (el plan original lo condiciona a "si se aprueba"). G1 es el de mayor relación esfuerzo/beneficio: una línea en `proxy.ts` poblando el ALS + `logger` ya mergea el contexto automáticamente.

---

## 4. Criterios de aceptación TSK-020

- [x] Matrix de señales inventariada y verificada contra código → **este documento**
- [x] Convención de IDs documentada (§1)
- [ ] Correlation IDs implementados en proxy/triggers/SIEM → **pendiente de aprobación** (§3 G1–G3)

**Fuentes primarias:** `src/proxy.ts` · `src/lib/logger.ts` · `src/app/api/telemetry/vitals/route.ts` · `src/app/api/ai/healthcheck/route.ts` · `src/server/auth/cron.ts` · `scripts/quality-gate.mjs`
