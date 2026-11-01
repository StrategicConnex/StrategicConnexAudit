> ⚠️ **[HISTÓRICO — ARCHIVADO 2026-11-01]** Catálogo de hallazgos del 2026-09-14 sobre el producto real.
> Los P0 aquí listados (escaneo síncrono sin `maxDuration`, dispatcher no-op, datos fabricados, RLS parcial, etc.) fueron tratados por el plan P0/P1/P2 posterior y la auditoría de 2026-10-11 — ver `FINAL-SUMMARY.md` (2026-10-18) y `docs/CHANGELOG.md`.
> Estado de la deuda técnica viva hoy: `docs/technical-debt/TECH-DEBT-REGISTER.md` (19/29 resueltas a 2026-11-01).
> Vigente: `docs/architecture/CURRENT-STATE.md` · Informe maestro: `docs/MASTER-REPORT-2026-11-01.md`.

---
# Plan de Mejoras y Evolución — StrategicAudit Pro

**Fecha:** 2026-09-14 · **Alcance:** análisis de ~70.000 líneas en `strategicaudit-pro/src` (backend, frontend, datos, auth, CI)

---

## 1. Diagnóstico general

StrategicAudit Pro es una plataforma de inteligencia de seguridad multi-tenant construida sobre:

- **Next.js 16 (App Router)** en Vercel, con proxy propio (`src/proxy.ts`) que genera CSP con nonce por request.
- **Supabase** (auth + Postgres + Realtime) con Drizzle ORM: **61 tablas**, acceso dual `db` (superusuario, pooler 6543) y `directDb` (bypass RLS, 5432). RLS se aplica mediante `withRLS()` (transacción con `SET LOCAL ROLE authenticated`).
- **Trigger.dev v4.5.14**: 14 tasks en background (audits, uptime, discovery, adversary, SIEM, cleanup…).
- **Motor de inteligencia propio** (`src/server/intelligence`): 34 ejecutores nativos registrados en `core/tool-registry.ts`, dispatcher con semáforos por categoría, caché TTL, egress-guard anti-SSRF (CIDR v4/v6, IPv4-mapped-IPv6, re-validación de redirects). Todo corre sobre APIs gratuitas (freeipapi, rdap.org, NVD 2.0) — sin claves de pago.
- **Capa IA** (`src/server/ai/ai-router.ts`): routing de 5 task types sobre OpenRouter (`openrouter/free`) con cadenas de fallback de modelos `:free` verificados, matriz de capacidades, timeouts por tarea y circuit breaker Redis. Function calling con registry Zod→JSON Schema.
- **Frontend**: design system propio "SCAUDIT v4" en OKLCH (oliva + oro + teal, estilo war-room NOC), fuentes Space Grotesk / Inter / JetBrains Mono, glassmorphism, fondo neural en Canvas 2D, tema claro/oscuro real, i18n next-intl (es/en, 470 claves por idioma).

**Valoración global:** la base es sólida y muy superior a la media — el egress-guard, el registro de tools con tipos inferidos, el code-splitting de tabs y el design system son puntos fuertes genuinos. La deuda se concentra en: **(a)** el pipeline de escaneo (3 orquestadores divergentes, timeouts no operativos, política de planes desactivada), **(b)** la brecha de RLS y el pipeline de migraciones, **(c)** tres tabs-monolito de ~1.000 líneas con colores crudos fuera del sistema de tokens, y **(d)** CI que no falla cuando fallan los tests.

---

## 2. Hallazgos críticos (P0 — corregir primero)

### Backend / fiabilidad

| # | Problema | Ubicación |
|---|----------|-----------|
| B1 | **Escaneo completo síncrono dentro del request HTTP** sin `maxDuration`: `Promise.all` sobre ~24 tools con timeouts de hasta 45s. Vercel lo mata a 10–60s → 504 e investigaciones huérfanas en "running". | `src/app/api/intelligence/route.ts:233-275` |
| B2 | **El timeout del dispatcher es un no-op**: se crea `AbortController` pero ningún executor lee `ctx.signal` (ni `safeFetch` lo recibe). Un servidor que no resuelve cuelga todo el escaneo. | `src/server/intelligence/core/dispatcher.ts:102-104` |
| B3 | **Datos fabricados presentados como reales**: fallback GeoIP inventa ciudad/ASN/ISP por hash y `serverlessPing` devuelve `open: true, durationMs: 45+random` cuando falla. En un producto de seguridad esto corrompe la confianza. | `src/server/intelligence/executors/network-executors.ts` (~líneas 29 y 148) |
| B4 | **Policy enforcer muerto pero costoso**: hardcodea `allowed = true` y aun así ejecuta ~5 queries (suscripción→plan→proyecto→usuario) + insert de usage **por cada tool** (~48 queries por escaneo). | `src/server/intelligence/core/policy-enforcer.ts:74-78` |
| B5 | **3 orquestadores de escaneo divergentes** con listas de tools hardcodeadas distintas (el público omite `dns.dnssec`, `tls.advanced`, `subdomain_takeover`…). Drift garantizado. | `intelligence/route.ts`, `intelligence/investigations/route.ts`, `public/v1/intelligence/route.ts:199-211` |
| B6 | **Rate limiting en memoria en serverless** (3 implementaciones: `core/rate-limiter.ts`, `looker-studio/route.ts`, fallback de `shared/lib/ratelimit.ts`). Se resetea entre instancias y fuga memoria. | ver §4 |
| B7 | **TTLs por-tool declarados pero ignorados** (dispatcher usa TTL fijo de 5 min; `dnsCache`/`geoipCache` se crean y no se usan; la "LRU" es FIFO). | `core/tool-registry.ts`, `core/dispatcher.ts:89-90`, `core/cache.ts:82-89` |
| B8 | **Webhooks sin timeout ni idempotencia**: `fetch` sin `AbortSignal`, un endpoint que falla reintenta **todos** (duplicando entregas ya hechas), y `assertPublicHostname` + `fetch` crudo deja ventana DNS-rebinding. | `src/trigger/webhook.trigger.ts:61-72` |
| B9 | **Uptime monitor**: `validateSafeUrl` trata fallo DNS como *pass* y luego hace `fetch` crudo (TOCTOU); loop secuencial con `wait.for(1s)` limita a ~85 proyectos por ciclo de 15 min. | `src/trigger/uptime.trigger.ts:28-40`, `egress-guard.ts:277-283` |
| B10 | **Colisión de caché de IA**: la clave es task + primeros 100 caracteres del último mensaje → dos conversaciones con el mismo prefijo reciben la respuesta cacheada de la otra. | `src/server/ai/ai-router.ts:241-244` |
| B11 | **Logger roto en background**: `log()` llama `headers()` para niveles security/error → lanza en cron/Trigger.dev y los registros de auditoría se pierden silenciosamente. | `src/shared/lib/logger.ts` |
| B12 | Trigger.dev: imports mixtos v3/v4, `monitoring.trigger.ts` es un stub que siempre corre `tls.scan`, `hello.trigger.ts` es demo, `console.log` en vez de `logger`. | `src/trigger/*` |

### Seguridad / datos

| # | Problema | Ubicación |
|---|----------|-----------|
| S1 | **RLS habilitada solo en ~19 de 61 tablas** (faltan `adversary_*`, `mitre_*`, `dns/whois_history`, `reports`, `backlinks`, `integrations*`, `subscriptions`, `webhook_configs`, `monitoring_*`, `push_subscriptions`…). Hoy es fail-closed por accidente (sin grants a PostgREST) sobre una conexión superusuario. | `drizzle/0016-0025`, `src/shared/db/rls.ts` |
| S2 | **Email personal hardcodeado**: allowlist de rate-limit y default de `ADMIN_EMAIL`. Además el admin tiene dos fuentes de verdad (email en proxy vs `users.role` en `requireAdmin()`). | `shared/lib/ratelimit.ts:29-31`, `shared/lib/supabase/middleware.ts` |
| S3 | **Endpoint de escritura sin auth ni rate-limit**: `/api/telemetry/vitals` acepta rows para cualquier `projectId` conocido (spam/DB bloat). | `src/app/api/telemetry/vitals/route.ts` |
| S4 | **Pipeline de migraciones roto**: no existe `db:migrate` (solo `db:push` contra prod), `run-migration.ts` hardcodea un archivo y **tragándose todos los errores**, SQL manual suelto (`2026-08-25_*.sql`) generó drift documentado. El UNIQUE de `user_logs.user_id` existe en SQL pero no en el schema TS. | `src/shared/db/run-migration.ts`, `drizzle/` |
| S5 | **Secrets de webhook en texto plano** (`webhook_configs.secret_token`) + PII sin retención (`user_logs.ip_address`). | `schemas/monitoring.ts` |
| S6 | **API keys legacy sin scopes = acceso total** (`scopes.length === 0`) y `withPublicApi` no aplica rate-limit por defecto. | `src/shared/lib/api-keys.ts` |
| S7 | **CI no es gate**: `test-and-coverage` con `continue-on-error: true`, Newman opcional, **Playwright e2e nunca corre en CI**; umbral de cobertura 25%/20% no forzado. | `.github/workflows/ci.yml` |
| S8 | Env sin validación en boot (todo con fallback `""`); claves muertas declaradas (`geminiApiKey`, `bearerApiKey`, `aiBaseUrl`/`XIAOMI_BASE_URL`); ~10 rutas leen `process.env` directo en vez del módulo central. | `src/shared/config/env*.ts` |

### Frontend / experiencia

| # | Problema | Ubicación |
|---|----------|-----------|
| F1 | **Tabs no navegables por URL** (estado en `useState`): imposible deep-linkar, compartir o restaurar una pestaña. | `DashboardContainer.tsx` |
| F2 | **Sin navegación móvil**: la sidebar es `hidden md:flex`; en teléfono no se puede cambiar de tab. | `DashboardSidebar.tsx` |
| F3 | **3 monolitos**: `IntelligenceTab` (1.059 líneas, 29 useState), `MonitoringTab` (984), `SettingsTab` (980). La extracción ya empezó (`tabs/intelligence/`) — hay que terminarla. | `src/features/dashboard/tabs/` |
| F4 | **React Flow estático en `/intelligence`** (~200KB+CSS en el primer render; v11 vieja, hoy es `@xyflow/react`). | `TopologyGraph.tsx` → `IntelligenceShell.tsx` |
| F5 | **~150 clases de color crudas** fuera del sistema OKLCH (`text-amber-400`×28, `bg-red-500`×24, `bg-gray-900`…): se rompen en modo claro. Además `ScoreGauge` hardcodea hex legacy y `rgba(255,255,255,0.04)` invisible en claro. | MonitoringTab, IntelligenceShell, LiveMetricsBar, ToolCatalog, `ScoreGauge.tsx:16-20` |
| F6 | **Datos demo en producción**: `DEMO_EVENTS`/`DEMO_EVIDENCES` en IntelligenceShell, HUD con "EgressGuard Activo / 16 Herramientas Core" hardcodeados, botón de escaneo con progreso simulado. | `IntelligenceShell.tsx:30-45`, `QuickMetricsHud.tsx` |
| F7 | **Dead deps**: `three`, `@react-three/fiber`, `@tanstack/react-query`, `@fontsource/dm-sans` nunca se importan. `BulkCommandDialog.tsx` (122 líneas) exportado y jamás importado. | `package.json`, `features/intelligence/components/` |
| F8 | **View Transitions fantasma**: CSS y comentarios asumen `experimental.viewTransition`, pero `next.config.ts` no lo activa → CSS muerto y comentario mentiroso. | `globals.css:335-357`, `app/template.tsx` |
| F9 | **i18n hueco justo en lo nuevo**: DashboardHeader, IntelligenceShell, ToolCatalog, CopilotConsole, LiveMetricsBar con español hardcodeado; `<html lang="es">` fijo aunque el locale sea en; el switcher hace `window.location.reload()`. | ver §6 |
| F10 | **Accesibilidad**: modales sin `role="dialog"`/Escape/focus-trap, nav sin `aria-current` ni roles de tablist, expansión de LiveMetricsBar solo por hover, sin `aria-live` en terminal de escaneo/copilot, decoraciones `animate-pulse` sin `motion-reduce`. | ver §6 |

---

## 3. Roadmap por fases

> Estimaciones para 1–2 dev. Cada fase deja el sistema deployable.

### Fase 0 — Quick wins (≈ 1 semana)
1. Eliminar dead deps (`three`, `@react-three/fiber`, `@tanstack/react-query`, `@fontsource/dm-sans`) y `BulkCommandDialog.tsx`.
2. Mover email personal a env (`AUTH_EMAIL_ALLOWLIST`, `ADMIN_EMAIL` ya soportados) y unificar admin en `users.role`.
3. `export const maxDuration = 60` en `api/intelligence/route.ts` como parche inmediato (la solución de fondo es Fase 1.1).
4. Envolver `TopologyGraph` en `next/dynamic ssr:false`.
5. Activar `experimental.viewTransition` en `next.config.ts` (o borrar el CSS muerto).
6. Quitar datos demo (`DEMO_EVENTS`, HUD falso) o marcarlos como `demo` condicionados a `NODE_ENV`.
7. Marcar resultados degradados en los executors (B3): `degraded: true` + `dataQuality: 'estimated'` en vez de inventar valores.
8. Borrar `hello.trigger.ts`, unificar imports `@trigger.dev/sdk`, reemplazar `console.log` por `logger` en triggers.
9. Hash completo del array de mensajes en la caché de IA (B10).

### Fase 1 — Motor de escaneo (≈ 2–3 semanas)
1. **Unificar en un solo `runScan(investigationId, toolIds)`** como servicio único (idealmente dentro de un task de Trigger.dev) usado por las 3 rutas; lista de tools derivada del registry, nunca hardcodeada.
2. **Threading de `ctx.signal`** a `safeFetch` y checks entre iteraciones de loops en executors → timeout real.
3. Resolver el plan/suscripción **una vez por escaneo** y pasarlo a `executeTool`; decidir si el policy-enforcer se activa de verdad (cuotas/costUnits/requiredPlan) o se elimina.
4. TTLs por-tool respetados en el dispatcher; caché de resultados DNS/OSINT **compartida vía Redis** (el `cache_key` de `intelligence_tool_runs` ya lo anticipa).
5. Consolidar rate limiting en Upstash (`shared/lib/ratelimit.ts`); eliminar las 3 implementaciones en memoria.
6. Webhooks: `safeFetch` + timeout, catch por endpoint, header de idempotencia (event-id dedupe).
7. Uptime: `safeFetch` + `runWithPool` (ya existe en `core/concurrency.ts`) + flags enable/disable por proyecto.

### Fase 2 — Seguridad y datos (≈ 2 semanas)
1. **Completar RLS** en las ~42 tablas restantes con el patrón member-or-owner existente + **test de inventario RLS** que compare `pg_tables`/`pg_policies` contra un manifest y falle CI si falta una.
2. **Pipeline de migraciones**: añadir `db:migrate` (`drizzle-kit migrate`), `drizzle-kit check` en CI, prohibir `db:push` fuera de dev, script de paridad TS-schema↔migraciones (habría cazado el drift de `user_logs`).
3. Validación Zod fail-fast de env en producción; eliminar claves muertas.
4. Arreglar `logger.ts` para no llamar `headers()` fuera de request (contexto opcional inyectado).
5. Auth + rate-limit en `/api/telemetry/vitals` (firma HMAC o session + límite por proyecto).
6. Cifrado de `webhook_configs.secret_token` (AES-GCM con key de env) y política de retención/pseudonimización de IPs.
7. Forzar scopes en API keys legacy + rate-limit por defecto dentro de `withPublicApi`.
8. Migrar fetch de credenciales dispersas al módulo central `env-secrets.ts`.

### Fase 3 — Experiencia frontend (≈ 2–3 semanas) → detalle en §6
1. Tabs por URL (searchParams o segmentos de ruta) con SSR por tab.
2. Drawer de navegación móvil reutilizando `NavButton` + `aria-current`.
3. Split de los 3 monolitos en cards por archivo + hooks co-localizados (continuar el patrón `tabs/intelligence/`).
4. Kit accesible de `Dialog` (rol, aria-modal, Escape, focus-trap, scroll-lock) para los 4 modales existentes.
5. Barrido de design tokens (F5) y adopción de `Button`/`Card`/`Badge`/`Skeleton` en los offenders.
6. Barrido i18n de los componentes nuevos + `<html lang>` dinámico + `router.refresh()` en vez de reload.
7. Data-fetching con react-query (ya está en deps) o un `useFetch` propio con retry/dedup.

### Fase 4 — Nuevas herramientas (≈ 3–4 semanas) → detalle en §5

### Fase 5 — Observabilidad y CI (≈ 1–2 semanas)
1. Sentry + OpenTelemetry (spans en tool-runs, ai-router, DB); llenar `docs/observability/` (hoy vacía).
2. CI duro: quitar `continue-on-error`, Playwright (al menos `pentest-auth-ratelimit.spec.ts`) contra preview deploys, ratchet de cobertura, Newman en PR.
3. Postgres efímero en CI (branch de Supabase o Neon) para correr migraciones + tests de RLS reales.
4. Tests de contrato para `withPublicApi` (matriz 401/403/scope/rate-limit) y para `requireAdmin`.
5. Postgres en CI para validar el esquema; alertas de expiración de API keys en cron.

---

## 4. Consolidación de duplicados (mapa de unificación)

| Duplicado | Instancias | Acción |
|-----------|-----------|--------|
| Orquestador de escaneo | `intelligence/route.ts` · `investigations/route.ts` · `public/v1/route.ts` | Un `runScan()` en Trigger.dev |
| Rate limiter | `core/rate-limiter.ts` · `looker-studio/route.ts` · fallback `ratelimit.ts` | Uno solo Redis-backed |
| Server actions | `actions.ts` (`protectedAction`) vs `actions/safe-action.ts` (`authenticatedAction`) | Mantener `safe-action`, migrar y borrar |
| Circuit breakers | `core/circuit-breaker.ts` (memoria, semi-usado) vs `shared/lib/circuit-breaker.ts` (Redis) | Uno Redis; aplicar el geoip a los executors que realmente llaman freeipapi |
| Tech profiler | `technology-profiler.ts` (registrado) vs `tech-profiler.ts` (muerto) | Borrar el muerto |
| Frameworks de error | `server/lib/app-error.ts`+`error-handler.ts` (1 sola ruta) vs `shared/lib/errors.ts` vs try/catch manual ×90 | Adoptar `withErrorHandler` en todas las rutas; un envelope `{success, error?, code?}` |
| Auth helper | `getCurrentUser/OrThrow` vs `createClient().auth.getUser()` inline en ~30 rutas | Usar siempre el helper |
| Registries de tools | `core/tool-registry.ts` (runtime) vs `registry/tool-registry.ts` (tipos) | Fusionar o documentar la frontera |
| Scheduler | 2 crons de Vercel vs Trigger.dev | Consolidar en Trigger.dev (Vercel solo como fallback documentado) |
| Timeout-Redis wrapper | `safeRedis` vs `Promise.race` en `ratelimit.ts` | Un utilitario |

---

## 5. Nuevas herramientas propuestas (producto)

### Executors nuevos (registry, costo ~cero — solo DNS/HTTP)
1. **`email.blacklists`** — DNSBL (Spamhaus, Barracuda…) por IP/MX. Definición huérfana ya existe en el registry; es DNS puro.
2. **`email.bimi` + `email.mail_health`** — BIMI/MTA-STS/TLS-RPT y score compuesto de salud de correo (completa el mayor hueco de definiciones huérfanas).
3. **`network.port_scan`** — el sandbox adversary ya tiene la primitiva de probe; exponerla como tool con `requiredPlan` y el policy-enforcer **activado de verdad** para categoría `active-intrusive`.
4. **`threat.urlhaus` / `threat.phishing`** — feeds gratuitos URLhaus/PhishTank vía `safeFetch` + circuit breaker, correlacionando con `threat.ip_reputation`.
5. **`website.sitemap_audit`** — crawl consciente de robots.txt para rutas de staging expuestas (extiende `website.robots`).
6. **`dns.dmarc_report_analytics`** — parseo de reportes DMARC agregados (XML) desde un endpoint/webhook del cliente.

### Endpoints / plataforma nuevos
7. **SSE `GET /api/public/v1/investigations/:id/stream`** — progreso en vivo; `intelligence_run_events` ya almacena el timeline (hoy la UI hace polling).
8. **`POST /api/webhooks/inbound/:projectId`** — webhook genérico por proyecto (HMAC propio reutilizando `cicd-helper.ts`) → dispara escaneo en Trigger.dev. Abre la puerta a clientes CI/CD.
9. **`GET /api/intelligence/diff?a=…&b=…`** — diff de postura entre investigaciones (drift-analyzer e history ya producen los datos).
10. **`POST /api/reports/schedule`** — reportes PDF programados por email (Resend + `pdf-template.tsx` ya existen).
11. **Integración de tickets (Jira/Linear)** — `POST /api/integrations/tickets`: los findings ya llevan `remediation`; auto-filing de incidencias.
12. **ACK de alertas SIEM** — `POST /api/security/siem/ack` + botones interactivos en Slack: `siemAlertLogs` existe pero nadie escribe el acknowledgment.
13. **Cola de escaneo compartida en Redis** con concurrencia por plan — convierte el policy-enforcer en real y desacopla definitivamente el escaneo del request HTTP.

---

## 6. Mejoras visuales propuestas

### Consolidación (antes de añadir)
- **Tokens primero**: reemplazar las ~150 clases crudas por tokens OKLCH; refactor de `ScoreGauge` a `--chart-*`; fijar strokes `rgba(255,255,255,*)` que desaparecen en claro.
- **Adopción de primitivas**: `Button`/`Card`/`Badge` en MonitoringTab, IntelligenceShell, LiveMetricsBar, ToolCatalog (hoy hand-rolled).
- **Dialog accesible** + **drawer móvil** + **nav con `aria-current`/tablist** + `aria-live` en terminal de escaneo y copilot + `motion-reduce:` en decoraciones.

### Widgets nuevos (identidad war-room NOC)
1. **Threat Feed Ticker ("SOC wire")** bajo el header: cinta de findings en vivo con severidad coloreada (`--chart-danger/warning/success`), pausable y `aria-live="polite"`.
2. **Matriz de calor MITRE ATT&CK** en OverviewTab: grid interactivo de técnicas con hover-cards (ya existen `/mitre-coverage` y el namespace i18n `adversaryReal`).
3. **Radar de assets en vivo**: reutiliza `radar-grid` + `scan-pulse` para "blips" de assets recién descubiertos vía `useRealtimeMetrics` (Supabase Realtime).
4. **Sparkline de drift** junto al ScoreGauge: historial semanal del score (la API `/api/intelligence/drift` ya existe).
5. **Command palette (⌘K)** extendiendo `GlobalTargetCommand`: navegación fuzzy a tabs/proyectos/tools, deduplicando el catálogo con el registry del servidor.
6. **Donut de severidad / composición de superficie de ataque** junto a la topología, coloreado con `useChartColors()`.
7. **Scrubber de "playback" de investigación**: replay de la TelemetryTimeline con slider temporal.
8. **Fondo neural reactivo al escaneo**: extender el prop `listening` de `NeuralNetworkBackground` (hoy solo copilot) al progreso de investigaciones — la "pared" entera reacciona.

### Limpieza visual puntual
- `<html lang>` dinámico según locale; títulos del header a i18n; avatar "JU" estático → menú de usuario real (nombre, plan, logout).
- `LiveMetricsBar`: colores al tema + expansión por foco/blur además de hover.
- skeletons con texto a i18n; eliminar `text-muted-foreground` vs `text-muted-fg` (duplicar token).

---

## 7. Resumen de prioridades

| Prioridad | Tema | Esfuerzo | Impacto |
|-----------|------|----------|---------|
| P0 | B1–B3 (escaneo síncrono, signal, datos falsos) | 1 sem | El producto no miente ni se cae |
| P0 | S2, S3, S8 (email hardcodeado, vitals, env) | 3 días | Higiene de seguridad |
| P1 | Fase 1 completa (motor unificado) | 2–3 sem | Fiabilidad + coste de DB −90% en policy |
| P1 | F1–F4 (tabs URL, móvil, monolitos, reactflow lazy) | 2–3 sem | UX fundamental |
| P2 | S1, S4, S7 (RLS, migraciones, CI) | 2 sem | Riesgo estructural |
| P2 | F5–F10 (tokens, a11y, i18n) | 2 sem | Calidad percibida |
| P3 | Fase 4 (nuevas tools) + Fase 5 (observabilidad) | 4–5 sem | Diferenciación y operación |
