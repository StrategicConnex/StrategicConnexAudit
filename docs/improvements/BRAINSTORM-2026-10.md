# Tormenta de ideas — SCAUDIT Pro (anexar / mejorar / agregar)

> **Fecha:** 2026-10-05 · **Alcance:** análisis del código real en `strategicaudit-pro/src`
> (~1.200 archivos, 46 route handlers, 69 tablas, 25 triggers Trigger.dev).
> **Relación con planes previos:** existe `Plan_de_Mejoras_StrategicAudit_Pro.md`
> (2026-09-14, deuda técnica P0–P3) y `docs/improvements/MASTER_PROMPT-v4-AUDIT.md`
> (2026-08-02, gaps de proceso). Este documento **no los repite**: aporta ideas
> *nuevas* de producto y de plataforma, y solo cita esos planes cuando una idea
> los complementa.

---

## 0. Diagnóstico en una línea

La base es sólida y muy por encima de la media (motor de inteligencia con 43 tools,
egress-guard SSRF, IA con fallback a modelos `:free`, SIEM multicanal, adversary
simulation, MITRE, PWA/i18n). El producto ya **escanea, detecta y reporta**; el hueco
funcional está en **cerrar el ciclo**: convertir hallazgos en trabajo asignado y
verificado, mostrar la postura agregada, y dejar que el cliente integre/automatice.
La deuda de plataforma está en **no mentir con datos fabricados, ser clara en
observabilidad (SLO/costos) y permitir rollout progresivo**.

> Aviso de honestidad de datos: `src/server/ai/seo-report-service.ts` **sigue
> fabricando** `healthScore` (85/45) y `crawledCount = 142` (L109-111). Es el
> residuo del bug ya corregido en las cards. Debe eliminarse igual que se hizo en
> `ProjectCard.tsx`.

---

## A. Quick wins (alto valor, bajo esfuerzo)

| # | Idea | Fundamento en el código | Esfuerzo |
|---|------|--------------------------|----------|
| A1 | **Matar el último dato fabricado** en el reporte SEO (`85/45`, `crawledCount 142`) → usar `healthFromIssueCounts()` y el conteo real de `crawl_results`. | `src/server/ai/seo-report-service.ts:109-111`; `src/shared/utils/health-score.ts` | ½ día |
| A2 | **Cerrar el hueco `/dashboard` (404)** con redirect a `/` o una página real de "portafolio" (ver B2). | Solo existen `src/app/dashboard/realtime` y `/usage`; no hay `page.tsx`. | ½ día |
| A3 | **Usar `warningIssuesCount`** (calculado y no consumido) para el color/umbral del score o el badge de la card. | `src/app/page.tsx` (issues agrupados) | ½ día |
| A4 | **`ErrorState` reutilizable** (v4 UX-001): estados de error consistentes en los 11 tabs. | `OverviewTab.tsx` sin handler de error explícito | 1 día |
| A5 | **Feature flags mínimo** (`flags.ts` por env) para cambios de alto riesgo; cierra ROLL-001 y permite canary. | v4-audit §12 | 1-2 días |
| A6 | **`Idempotency-Key`** en POST de `/api/webhooks`, `/api/ai/report` y disparo de audit. | v4-audit API-001 | 2 días |
| A7 | **Barrido i18n** de los componentes nuevos + `<html lang>` dinámico + `router.refresh()` en vez de `location.reload()`. | `LanguageSwitcher.tsx`, `DashboardHeader.tsx` | 2 días |
| A8 | **Adoptar React Query con `staleTime`** o un `useApiQuery` propio (hoy la dep `@tanstack/react-query` es *dead dep*). | `package.json`; CACHE-001 | 2-3 días |

---

## B. Adiciones funcionales (nuevas capacidades de producto)

Estas son las que hacen el producto **más funcional**, ordenadas por impacto.

### B1. Ciclo de vida del hallazgo (triage Kanban + SLA) — **la más valiosa**
Hoy `issues` solo tiene `fixed: boolean` y `intelligence_findings` tiene triage IA
pero **ningún estado humano persistido** (aceptado / falso positivo / en progreso /
resuelto), ni responsable, ni fecha límite. 
- Añadir estado + `assigneeId` + `dueDate` + `slaHours` a findings.
- Tab "Triage" con columnas por estado, drag & drop, y reloj de SLA.
- Backend: `POST /api/intelligence/findings/:id/transition`.
- Fundamento: `src/shared/db/schemas/index.ts:259` (issues), `intelligence.ts:76`
  (findings + `aiTriageAt`), `src/trigger/finding-triage.ts` (ya clasifica con IA).

### B2. Vista de portafolio / postura agregada (CISO board)
El dashboard es una lista de cards por proyecto; no hay **roll-up cross-proyecto**.
- Score corporativo, top-5 proyectos con peor postura, tendencia temporal,
  hallazgos críticos abiertos por proyecto, cobertura MITRE agregada.
- Reutiliza `healthFromIssueCounts`, `withRLS`, `audits`, `issues`.
- Fundamento: `src/app/page.tsx` (loader actual), `DashboardContainer.tsx`.

### B3. Centro de notificaciones in-app (bandeja)
Las alertas salen a Slack/PagerDuty/Splunk/email/push, pero **no hay inbox dentro
de la app**. 
- Campana con contador, marcado leído, filtros por severidad/proyecto.
- Fuente: `monitoring_alerts` y `siem_alert_logs` **ya existen**; falta la UI + estado `read`.
- Fundamento: `src/shared/db/schemas/monitoring.ts:23`, `security-audit.ts:38`.

### B4. Ampliar cobertura MITRE a las 13 tácticas
El registry define **13 tácticas** (`mitre/techniques.ts:31-43`) pero solo hay
técnicas para ~5 (Recon, Resource Dev, Discovery, Collection, C2). Faltan
Execution, Persistence, Privilege Escalation, Defense Evasion, Credential Access,
Lateral Movement, Impact.
- Mapear más tools + escenarios adversary a las tácticas faltantes; el heatmap de
  `/mitre-coverage` se vuelve realmente representativo.
- Fundamento: `src/server/intelligence/mitre/*`, `adversary/`.

### B5. Purple-Team score: detección vs ejecución
`mitre_evaluations` y `mitre_technique_results` ya registran qué se detectó y qué
no. Convertirlo en un **score de detección** con tendencia ("subimos 12% este mes"),
por técnica y por proyecto, y un informe de brechas de detección.
- Fundamento: `adversary-assessments`, `adversary_runs.result = missed/detected`.

### B6. Comentario de acumulación de hallazgos
- **Supresión/baseline con expiración**: silenciar falsos positivos conocidos por N
  días, reduciendo fatiga de alertas. Fundamento: findings + `siem_alert_logs`.
- **Reglas de escalado SLA**: crítico sin ACK en X min → Escalar a PagerDuty.
  Fundamento: `src/server/security/siem-exporter`.

### B7. Webhooks outbound configurables por el cliente
`webhook_configs` + `webhook.trigger.ts` existen, pero el cliente no tiene UI para
suscribirse a eventos (`finding.created`, `score.changed`, `cert.expiring`).
- Página Settings → Webhooks + firma HMAC reutilizando `cicd-helper.ts`.
- Fundamento: `src/trigger/webhook.trigger.ts`, `schemas/monitoring.ts`.

### B8. Página pública de estado por proyecto (extensión del portal)
`/s/[id]` y `/p/[token]` (HMAC con `PORTAL_LINK_SECRET`) ya existen. Añadir una
**página de estado compartible** (uptime, score actual, última auditoría,
certificados) con branding del proyecto — un "status page" listo para clientes.
- Fundamento: `src/server/lib/portal-tokens.ts`, `app/p/[token]/page.tsx`.

### B9. Analítica de tendencias (nueva tab)
Score histórico, MTTR de hallazgos, uptime %, cobertura de detección — todo el
dato **ya existe** disperso (`history`, `drift`, `uptime_logs`, `web_vitals_logs`),
pero no hay una vista de series temporales dedicada.
- Fundamento: `src/app/api/intelligence/drift`, `api/monitoring`, `uptime_logs`.

### B10. Enriquecimiento de activos (CMDB-lite)
`intelligence_assets` existe; añadir owner, criticidad de negocio, etiquetas y
ambiente (prod/staging) para **priorizar hallazgos por impacto real** y poder ver
"mis activos".
- Fundamento: `schemas/intelligence.ts` (assets), `discovery/orchestrator.ts`.

### B11. Integración de tickets (Jira / Linear / GitHub Issues)
El motor de remediación `remediation_actions` ya tiene el connector
`github.create_issue`. Extender a Jira/Linear para **auto-file de hallazgos** con
severidad, MITRE y remediación IA.
- Fundamento: `src/shared/db/schemas/remediation.ts`, `server/lib/remediation/`.

### B12. Console de búsqueda IOC (query-first, estilo GreyNoise)
Un buscador único "pega una IP/dominio/hash y obtén todo" (DNS, WHOIS, TLS, reputación,
breaches, geo). El competitive-analysis (§4) marca las interfaces *query-first* como
tendencia dominante. Es una cara nueva sobre el registry de 43 tools.
- Fundamento: `src/server/intelligence/registry/tool-registry.ts`, `api/intelligence`.

### B13. Expansion de la API pública v1
Hoy `public/v1` cubre inteligencia. Exponer **audits, findings, reports y resultados
de adversary** con keys con scopes (hoy las legacy sin scopes = acceso total, S6),
más un **SDK TypeScript** generado desde `openapi.json`.
- Fundamento: `src/app/api/public/v1/`, `withPublicApi`, `shared/lib/api-keys.ts`.

### B14. Paquetes de compliance más allá de SOC2
Solo existe `/api/compliance/soc2-pack`. Añadir **ISO 27001, GDPR, PCI-DSS, NIST CSF**
derivados de los hallazgos existentes, con un dashboard de % de controles cubiertos.
- Fundamento: `src/app/api/compliance/soc2-pack/route.ts`.

### B15. Retest / regresión de escenarios adversary
`weekly-pentest.trigger.ts` existe. Añadir un flujo de **retest** que re-ejecuta
solo los escenarios antes fallidos y muestra *antes/después* por engagement.
- Fundamento: `src/trigger/weekly-pentest.trigger.ts`, `adversary_engagements`.

### B16. Bot bidireccional Slack/Teams
Las integraciones (`integrations/slack`, `integrations/teams`) hoy solo notifican.
Añadir comandos (`/scaudit scan <dominio>`) y botones interactivos (ACK de alerta,
lanzar escenario) — muy "functional" para SOC.
- Fundamento: `src/server/integrations/{slack,teams}`.

---

## C. Mejoras de plataforma / arquitectura

| # | Idea | Fundamento |
|---|------|-----------|
| C1 | **SSE/Realtime en vez de polling** en dashboard y progreso de investigaciones (hoy polling 15s; `intelligence_run_events` ya almacena el timeline). | `LiveMetricsBar`, `OverviewTab`, v4-audit CACHE |
| C2 | **Caché distribuida de resultados de tools en Redis** keyed por `cache_key` (ya anticipado en `intelligence_tool_runs`). | Plan previo Fase 1.4 |
| C3 | **Cola de escaneo en Redis con concurrencia por plan** — hace real el policy-enforcer y saca el scan del request HTTP. | `core/policy-enforcer.ts` |
| C4 | **Observabilidad: Sentry + OpenTelemetry** (spans en tool-runs, ai-router, DB) y página "Platform Health" con SLI reales. | v4-audit SLO-001; `docs/observability/` vacía |
| C5 | **Contador de costos/uso de IA** visible (hoy `ai_health_logs` existe pero no hay panel de gasto/latencia por modelo en producto). | `ai_health_logs`, `ai-router.ts` |
| C6 | **Outbox pattern** para notificaciones/webhooks (entrega at-least-once confiable). | `src/server/notifications/` |
| C7 | **Test de inventario RLS** que compare `pg_tables`/`pg_policies` contra un manifest y falle CI si falta una. | v4/Plan S1 |

---

## D. Endurecimiento y pruebas

| # | Idea | Fundamento |
|---|------|-----------|
| D1 | **Fuzz/property tests del egress-guard** (CIDR v4/v6, IPv4-mapped, redirects) — componente SSRF crítico. | `shared/lib/egress-guard.ts` |
| D2 | **Chaos test del AI router**: caída de todos los modelos → respuesta resiliente degrable. | v4-audit §13.2 |
| D3 | **E2E de aislamiento multi-tenant**: usuario A no ve datos de B vía RLS. | `withRLS` |
| D4 | **Tests de contrato de la API pública** (matriz 401/403/scope/rate-limit). | `withPublicApi` |
| D5 | **CI duro**: quitar `continue-on-error`, correr Playwright en preview, ratchet de cobertura. | v4/Plan S7 |

---

## E. Pulido visual / UX

| # | Idea | Fundamento |
|---|------|-----------|
| E1 | **Command palette (⌘K)** que navegue a tabs/proyectos/tools (extiende `GlobalTargetCommand`). | Plan §6.5 |
| E2 | **Threat Feed Ticker** ("SOC wire") bajo el header, `aria-live="polite"` y pausable. | Plan §6.1 |
| E3 | **Matriz de calor MITRE** interactiva en OverviewTab (enlaza con B4). | Plan §6.2 |
| E4 | **Sparkline de drift** junto al ScoreGauge (la API `/api/intelligence/drift` ya existe). | Plan §6.4 |
| E5 | **Empty states consistentes** por tab (complementa A4). | v4 UX-001 |
| E6 | **Barrido de tokens OKLCH** (~150 clases crudas) y `ScoreGauge` a `--chart-*`. | Plan F5 |

---

## F. Priorización sugerida (secuencia)

| Tanda | Contenido | Por qué |
|-------|-----------|---------|
| **1 — Verdad y limpieza** (1 sem) | A1–A4, E5 | El producto no miente y la UX de error es consistente |
| **2 — Cerrar el ciclo** (3-4 sem) | B1 (triage+SLA), B3 (inbox), B6 (supresión/escalado) | De "detecta" a "trabaja y cierra" hallazgos |
| **3 — Postura y analítica** (3 sem) | B2 (portafolio), B9 (tendencias), B4/B5 (MITRE/purple) | Visibilidad para CISO |
| **4 — Integración y ecosistema** (3-4 sem) | B7 (webhooks out), B11 (tickets), B13 (API/SDK), B16 (bots) | Deja que el cliente automatice |
| **5 — Plataforma** (4-6 sem) | A5/A6, C1–C4, D1–D5 | Fiabilidad, observabilidad, rollout seguro |

---

## G. Semillas ya presentes en el código (a consolidar)

- `warningIssuesCount` calculado y no usado (`src/app/page.tsx`).
- `/dashboard` sin `page.tsx` → 404 cosmético.
- `@tanstack/react-query` en deps y sin usar (dead dep).
- `seiAlertLogs` / `monitoring_alerts` sin UI que escriba `read`.
- `intelligence_assets` sin owner/criticidad.
- `remediation_actions` con máquina de estados completa pero UI limitada.
- `docs/observability/` vacía.
- MITRE: 13 tácticas definidas, ~5 cubiertas.
