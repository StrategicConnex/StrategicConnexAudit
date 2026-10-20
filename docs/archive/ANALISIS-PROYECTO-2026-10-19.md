# Análisis completo — SCAUDIT Pro

**Fecha:** 2026-10-19 · **Commit analizado:** `7449efb` (main, árbol limpio) · **Alcance:** código, tests, CI, datos y seguridad · **Método:** inspección del árbol + ejecución real de los gates.

---

## 1. Veredicto ejecutivo

SCAUDIT Pro es una plataforma **enterprise** de inteligencia de red, superficie de ataque, auditoría SEO y ciberseguridad continua. No es un prototipo: tiene 127 k líneas de TypeScript, 77 route handlers, 78 tablas con RLS, 64 migraciones, 285 archivos de test y un pipeline de CI con 9 jobs que incluye gitleaks, drift de esquema y pruebas de aislamiento multi-tenant.

**Estado medido hoy:**

| Gate | Resultado | Evidencia |
|---|---|---|
| `pnpm typecheck` | ✅ exit 0, 0 errores | ejecución de esta sesión |
| `pnpm lint` | ✅ exit 0, **0 errores** / 46 warnings | ejecución de esta sesión |
| `pnpm test` | ✅ **285 archivos, 2 764 tests, 0 fallos** (11 m 38 s) | ejecución de esta sesión |
| `pnpm build` | ✅ exit 0, compilado en 12,4 s; TS en 15,3 s | ejecución de esta sesión |
| `pnpm test:coverage` | ✅ **57,44 % stmts · 45,76 % branches · 50,81 % funcs · 58,83 % lines** (285 archivos, 2 764 tests) | ejecución de esta sesión |
| `pnpm audit --prod` | ⚠️ **25 vulnerabilidades: 1 crítica, 10 altas, 10 moderadas, 4 bajas** | ejecución de esta sesión |
| Integridad de migraciones | ✅ 64 archivos SQL = 64 entradas de journal; 0 huérfanos | conteo directo |
| Cobertura de rutas | ✅ **75/75** route handlers de `/api` con `route.test.ts` | conteo directo |

**Conclusión:** el proyecto está en un estado de madurez alto en ingeniería (tests, RLS, guards, CI), pero convive con tres riesgos que merecen atención inmediata: **(1) una vulnerabilidad crítica de Next.js 16.3.3**, **(2) dependencia total de OpenRouter como único proveedor de IA**, y **(3) documentación de arquitectura desactualizada** que ya no describe el sistema real (dice 42 rutas/58 tablas/22 migraciones; hay 77/78/64).

---

## 2. Qué hace el producto

| Dominio | Capacidades verificadas en código |
|---|---|
| **Dashboard de proyectos** | Multi-proyecto, health score, auditorías técnicas, keywords, Core Web Vitals, reportes PDF white-label |
| **Inteligencia de red** | DNS/WHOIS/GeoIP, subdominios, puertos, TLS, headers, OSINT, CVEs, drift, mapa Leaflet |
| **Descubrimiento continuo** | DNS brute force, Certificate Transparency, shadow assets, cron cada 6 h |
| **MITRE ATT&CK** | **23 técnicas únicas** mapeadas sobre **34 tools nativas**, dashboard `/mitre-coverage` |
| **Adversary simulation** | **14 escenarios** Atomic Red Team (`catalog.ts`), ejecución on-demand + cron |
| **IA** | Copilot, incident brief, reportes SEO, triage de findings, alertas narradas — todo vía OpenRouter |
| **Seguridad/SIEM** | **8 reglas de detección** (`RULES` en `siem-exporter.ts`), 4 canales (Slack/PagerDuty/Splunk/Email), push, audit log |
| **API pública v1** | API keys con scopes, rate limit por key, OpenAPI + Swagger + colección Postman |
| **Plataforma** | PWA offline, i18n es/en (756 claves), feature flags con rollout, cola de escaneo en Postgres |

---

## 3. Stack y topología

- **Frontend:** Next.js 16.3.3 (App Router, Turbopack), React 19.2.4, Tailwind v4, Recharts/React Flow/Leaflet/Three, `@react-pdf/renderer`.
- **Backend:** route handlers + server actions sobre Node.js; Drizzle ORM 0.45 + PostgreSQL (Supabase); Supabase Auth (magic link).
- **Jobs:** Trigger.dev 4.7.2 — **27 archivos `.trigger.ts`** (27 tests espejo); Vercel Cron como mecanismo garantizado (`/api/cron/siem`, `/api/cron/uptime`, `/api/ai/healthcheck`).
- **IA:** exclusivamente OpenRouter (`openrouter/free` + cadenas `:free` por tarea). Sin Anthropic/Gemini/NVIDIA/Xiaomi: los legados se eliminaron el 2026-10-17 y Anthropic el 2026-10-18; el detalle está en `tests/integration/AI-CONNECTIONS-REPORT.md`.
- **Observabilidad:** Sentry (server/edge/client), logs estructurados con correlation ID, `app_logs`, RUM de Web Vitals, AI health dashboard.
- **Hosting:** Vercel (`iad1`), despliegue automático desde `main`; docs en GitHub Pages.

### Capas reales

```
proxy.ts (CSP nonce, headers, sesión, disclaimer)
  └─ app/ (24 páginas, 77 route handlers)
       ├─ app/actions/ (server actions autenticadas)
       ├─ features/ (UI de inteligencia y dashboard)
       ├─ server/ (dominio server-only: ai, intelligence, security, reports…)
       ├─ shared/ (db + RLS, lib, config, schemas)
       └─ trigger/ (jobs)
```

---

## 4. Inventario medido

| Métrica | Valor |
|---|---|
| Archivos TS/TSX en `src/` | 777 |
| Líneas de código en `src/` | **127 215** |
| Líneas de tests (`src` + `tests` + `e2e`) | ~51 762 |
| Páginas (`page.tsx`) | 24 |
| Route handlers (`route.ts` en `src/app`) | **77** (75 bajo `/api`) |
| Archivos de test unitario/integración | **285** (2 764 tests) |
| Specs E2E Playwright | 6 |
| Migraciones SQL | **64** (journal = disco, sin huérfanos) |
| Tablas Drizzle (`pgTable`) | **78** |
| Archivos de schema | 25 |
| Tasks Trigger.dev | 27 archivos + 27 tests |
| Claves i18n | 756 en `es.json` y 756 en `en.json` (paridad exacta) |
| Técnicas MITRE únicas | 23 (46 entradas toolId → técnica) |
| Tools nativas registradas | 34 (`NATIVE_TOOLS`) |
| Escenarios de adversario | 14 |
| Reglas SIEM | 8 |
| Documentos en `docs/` | 161 |
| Archivos trackeados por git | 1 354 |

**Archivos más grandes** (señal de complejidad, no de error):

| Líneas | Archivo |
|---:|---|
| 1 060 | `src/features/dashboard/tabs/IntelligenceTab.tsx` |
| 1 049 | `src/features/dashboard/tabs/SettingsTab.tsx` |
| 1 044 | `src/server/ai/ai-router.ts` |
| 997 | `src/features/dashboard/tabs/MonitoringTab.tsx` |
| 910 | `src/app/docs/api/playground/page.tsx` |
| 881 | `src/server/intelligence/executors/network-executors.ts` |
| 856 | `src/features/dashboard/tabs/OverviewTab.tsx` |
| 846 | `src/server/reports/pdf-template.tsx` |

29 archivos superan las 500 líneas y 10 superan las 800. No se detectaron duplicados exactos de archivos con impacto.

---

## 5. Calidad verificada (ejecución de hoy)

### 5.1 Tests — 2 764 en verde

```
Test Files  285 passed (285)
     Tests  2764 passed (2764)
  Duration  697.58s
```

Fortalezas poco habituales:

- **100 % de los route handlers tienen test** (75/75), incluyendo casos "sin sesión → 401" en la mayoría.
- **RLS probado con Postgres real/PGlite**: `tests/security/*` cubre aislamiento entre tenants, owner-only tras la migración 0052, policies de UPDATE de inteligencia, herencia de grants y superficie de `withRLS`.
- **Guards como tests**: journal de migraciones, FK drift, índices declarados vs BD, `DROP … CASCADE`, TRUNCATE grants, paridad i18n, entrypoint único.
- **Tests de trigger** para los 27 tasks.
- **Tests de contrato** OpenAPI + colección Postman.

**Cobertura (`pnpm test:coverage`, ejecutada hoy):** 57,44 % statements, 45,76 % branches, 50,81 % funciones, 58,83 % líneas. Los cuatro umbrales duros de `vitest.config.ts` (45/35/39/46) se cumplen con 6–11 puntos de margen.

Coste: la suite tarda **~11,6 minutos** en local. Los tests RLS de PGlite son los más lentos (20–65 s por caso). Es aceptable en CI pero conviene dividir la suite (unit / RLS) para el ciclo de desarrollo.

### 5.2 Lint

0 errores, 46 warnings. La mayoría son `no-unused-vars` y `no-explicit-any` **en tests de integración**, no en código de producción. En `src/` sólo hay 2 `any` explícitos y 1 `@ts-ignore`, lo que indica disciplina de tipado.

### 5.3 Build

Compila y genera todas las rutas como dinámicas (`ƒ`), con Proxy (middleware) activo. No hay warnings de build de Next.js; sí un `ExperimentalWarning` de SQLite proveniente de tooling interno.

---

## 6. Seguridad

### 6.1 Controles verificados

| Control | Implementación | Valoración |
|---|---|---|
| **CSP con nonce por request** | `src/proxy.ts`; `strict-dynamic`; sin `unsafe-inline` en `script-src` en producción | Sólido |
| **Headers** | HSTS, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy, `upgrade-insecure-requests` | Sólido |
| **Auth de sesión** | `updateSession()` en proxy + `getCurrentUserOrThrow` en handlers | Sólido |
| **RLS multi-tenant** | `withRLS()` con `SET LOCAL ROLE authenticated` + claims JWT; 93 archivos lo usan | Sólido |
| **Guard anti-regresión RLS** | `db:rls-surface-guard` en CI detecta llamadas fuera de `withRLS` | Muy bueno |
| **SSRF** | `egress-guard.ts` con CIDR IPv4/IPv6, revalidación por salto, `safeFetchFollow` | Sólido |
| **Rate limit** | Postgres en producción, memoria en dev; fail-closed con techo por instancia; headers IETF | Sólido |
| **API keys** | Hash, scopes, expiración, rate limit por key, audit trail | Sólido |
| **Secretos** | `env-secrets.ts` server-only; `.env*` ignorado salvo `.env.example`; gitleaks en CI | Sólido |
| **Webhooks** | HMAC + guard SSRF; Slack con verificación de firma | Sólido |
| **Observabilidad de seguridad** | `security_audit_logs`, SIEM, alertas multi-canal | Sólido |

No se encontraron rutas privadas sin control: las 6 que no encajan en el patrón de auth son públicas por diseño (health, CSP report, telemetría con rate limit y schema, catálogo de planes, validate-email con rate limit, bulk con API key + scope).

### 6.2 Hallazgo crítico — dependencias

`pnpm audit --prod` reporta **25 vulnerabilidades**:

| Severidad | Paquete | Problema | Exposición real |
|---|---|---|---|
| 🔴 **Crítica** | `next@16.3.3` | RCE en `next/og` ImageResponse | La app **no usa `next/og`** (0 referencias), pero el framework está afectado y hay que parchear |
| 🟠 Alta | `next` | SSRF en Image Optimization | `images: {}` y sin `remotePatterns` → superficie reducida, pero sigue siendo framework |
| 🟠 Alta ×7 | `axios@1.18.1` | ReDoS, prototype pollution, bypass de proxy/DNS, SSRF vía redirect | Sólo alcanzable desde `swagger-ui-react` (página `/swagger`, carga diferida). Riesgo menor, pero es código de cliente público |
| 🟠 Alta | `sharp` | Vulnerabilidad en librsvg | Dependencia transitiva de Next; sin imágenes remotas |
| 🟠 Alta | `source-map-js` | DoS por source maps | Tooling de build |
| 🟡 Moderadas ×10 | `axios`, `next`, `sprintf-js` | Cache poisoning, header injection, NO_PROXY bypass, info disclosure | Parcial |
| 🟢 Bajas ×4 | `dompurify`, `katex`, `next` | Prototype pollution / dev MCP | Bajo |

**Acción P0:** subir Next.js a **≥16.3.8** (versión parcheada de los avisos actuales) y verificar con `pnpm audit --prod`. Revisar si `swagger-ui-react` puede actualizarse o aislarse; si no, añadir `pnpm.overrides` para `axios` parcheado o sustituir Swagger UI por una página estática de OpenAPI.

### 6.3 Observaciones menores

- `EMAIL_ALLOWLIST` incluye un email personal hardcodeado en `ratelimit.ts`. Es intencional y está documentado, pero conviene moverlo 100 % a `AUTH_EMAIL_ALLOWLIST`.
- `directDb` (bypass de RLS) se usa en contextos de sistema/admin; el guard de superficie RLS lo vigila. Mantener esa disciplina.
- El `warn` de Next sobre `swagger-ui-react` (bundle ~3 MB) es un coste de rendimiento, no de seguridad.

---

## 7. Datos

- **64 migraciones** en `drizzle/`, journal y disco en sync; última `0052_remove_project_members` (modelo owner-only).
- **78 tablas** repartidas en 25 archivos de schema.
- Estrategia RLS madura: `SET LOCAL ROLE`, claims por transacción, tests de aislamiento, guard de policies huérfanas tras `DROP … CASCADE`, auditoría de grants heredados y de `TRUNCATE`.
- **Riesgo abierto (TD-19):** el job de CI `Integration (Postgres real)` no puede migrar desde cero en Postgres vanilla porque 0016+ hacen `GRANT` sobre roles Supabase (`authenticated`, `anon`) que no existen; además hay un `syntax error` sin aislar. No afecta a la BD live, pero **el esquema no se valida desde cero en CI**. Es la deuda de datos más importante.
- **TD-08:** faltan snapshots intermedios de Drizzle (12), lo que limita regenerar migraciones sin una BD de referencia.

---

## 8. Operación y CI

El pipeline (`ci.yml`) tiene 9 jobs: `lint-and-build`, `typecheck`, `secret-scan` (gitleaks, barrera dura), `docs-quality-gate`, `test-and-coverage`, `db-drift-check`, `e2e`, `api-contract-test`, `integration`. Es más completo que el de la mayoría de proyectos de este tamaño.

Puntos fuertes:

- `install --frozen-lockfile`, cache de pnpm, límites de concurrencia.
- `db-drift-check` ejecuta `drizzle-kit check`, inventario RLS estático, guard de `DROP CASCADE`, anti-drift, FK, índices, grants, grants heredados y superficie RLS.
- El contrato API está **fail-closed**: sin `TEST_ENV`/`SCAUDIT_CONTRACT_BASE_URL`/`SCAUDIT_API_KEY` el job falla a propósito y nunca golpea producción (TD-20, bloqueado en configuración del owner).
- E2E separa lo bloqueante (auth + smoke + pentest de rate limit) de lo informativo (visual regression).

Puntos de atención:

- **TD-19** (migración desde cero) mantiene rojo el job de integración.
- **TD-20** mantiene rojo el job de contrato hasta configurar variables/secreto en GitHub.
- El cron de Vercel en plan Hobby es diario; la frecuencia real (5/15 min) depende de Trigger.dev. Si Trigger.dev no está desplegado o falla, los jobs frecuentes no corren.
- La suite local de 11,6 min y el uso de memoria (jsdom + PGlite) hacen costoso el ciclo de feedback; `maxWorkers` ya está limitado a 4 en local y 2 en CI.

---

## 9. Riesgos priorizados

| # | Prioridad | Riesgo | Impacto | Mitigación recomendada |
|---|---|---|---|---|
| R1 | **P0** | Next.js 16.3.3 con aviso crítico (RCE en `next/og`) y SSRF en Image Optimization | Framework vulnerable en producción | Actualizar a ≥16.3.8; repetir `pnpm audit --prod` y build |
| R2 | **P0** | OpenRouter es el único proveedor de IA | Si cae, copilot, reportes, triage y alertas narradas se degradan en silencio | Añadir un segundo proveedor o un modo degradado explícito (feature flag + mensaje UI); monitorizar `ai_health_logs` |
| R3 | **P1** | Documentación desactualizada: arquitectura dice 42 rutas/58 tablas/22 migraciones/611 tests (real: 77/78/64/2 764); README dice 16 técnicas MITRE, 12 escenarios, 7 reglas SIEM y 39 tools (real: 23, 14, 8 y 34) | Decisiones basadas en datos falsos; auditorías posteriores pierden credibilidad | Regenerar `SYSTEM-MAP.md` e `PROJECT-INVENTORY.md` desde el código y añadir un check de conteos |
| R4 | **P1** | 29 archivos >500 líneas (10 >800); tabs de 1 000+ líneas | Mantenibilidad y riesgo de regresión en UI | Extraer subcomponentes/hooks por tab; empezar por `IntelligenceTab` y `SettingsTab` |
| R5 | **P1** | TD-19: migración desde cero no validada en CI | Un cambio de esquema puede romper un entorno nuevo sin detectarse | Bootstrap idempotente de roles Supabase antes de migrar; aislar el `syntax error` |
| R6 | **P2** | 46 warnings de lint, 128 `console.log` en `src/` | Ruido y posible fuga de información en logs | Limpiar tests y migrar logs a `logger` |
| R7 | **P2** | Cobertura global 57,4 %, pero concentrada en dominio; TD-17 deja PDFs/tasks nuevas con cobertura baja | Puntos ciegos en código nuevo | Cubrir `outbox`/`scan-queue` y subir umbrales |
| R8 | **P2** | `swagger-ui-react` arrastra `axios` vulnerable y ~3 MB | Superficie y peso en página pública | Evaluar reemplazo por spec estática o parchear `axios` |
| R9 | **P3** | TD-08 snapshots Drizzle faltantes | Regeneración limitada | Documentar BD de referencia y regenerar |
| R10 | **P3** | `RESEND_API_KEY` ausente (TD-18) | Emails SIEM en fallback manual | Configurar al activar dominio de envío |

---

## 10. Fortalezas que conviene preservar

1. **Seguridad por defecto:** RLS real con tests, CSP con nonce, SSRF guard, rate limit fail-closed, gitleaks. No es común en proyectos de este tamaño.
2. **Cobertura de rutas al 100 %:** cada endpoint tiene test, incluyendo 401/403/500.
3. **Guards de base de datos en CI:** drift, FK, índices, grants, policies huérfanas. La migración 0052 se aplicó con verificación pre-COMMIT.
4. **Honestidad documental:** los reportes de IA dicen "0/5 respondieron" con causa raíz medida en lugar de asumir que funcionan. Esa cultura es un activo.
5. **Tipado disciplinado:** 2 `any` y 1 `@ts-ignore` en 127 k líneas.
6. **i18n con paridad exacta** (756/756 claves).

---

## 11. Plan recomendado

### Ahora (esta semana)

1. **Actualizar Next.js a ≥16.3.8** y re-ejecutar `pnpm audit --prod`, `typecheck`, `test` y `build`.
2. **Parchear o aislar `axios`** (override o actualización de `swagger-ui-react`).
3. **Decidir el failover de IA:** segundo proveedor o degradación explícita con flag y aviso en UI.
4. **Cerrar TD-20** configurando `TEST_ENV`, `SCAUDIT_CONTRACT_BASE_URL` y `SCAUDIT_API_KEY` en GitHub (decisión del owner).

### Próximas 2–3 semanas

5. Regenerar `SYSTEM-MAP.md` y `PROJECT-INVENTORY.md` con conteos automáticos.
6. Atacar TD-19 (bootstrap de roles Supabase + aislar el error de sintaxis).
7. Refactorizar `IntelligenceTab` y `SettingsTab` en subcomponentes.
8. Limpiar los 46 warnings de lint y los `console.log`.

### Trimestre

9. Elevar cobertura en `outbox.trigger`, `scan-queue.trigger` y PDFs (TD-17) y subir umbrales.
10. Dividir la suite en unit/RLS para reducir el ciclo local por debajo de 5 min.
11. Añadir un check de "documentación vs código" (rutas, tablas, migraciones, tests) al CI.

---

## 12. Límites de este análisis

- **No se ejecutaron E2E** (`pnpm test:e2e`): requieren navegador y servidor; el CI sí los corre.
- **No se ejecutó la suite de integración** contra Postgres real (`pnpm test:integration`), que es precisamente la afectada por TD-19.
- **No se validó la BD de producción** (drift, RLS live, datos): sólo el código y los tests que usan PGlite/Postgres de test.
- **No se probaron los proveedores externos** (OpenRouter, Supabase, Trigger.dev, SIEM): el análisis se basa en configuración y en el reporte `AI-CONNECTIONS-REPORT.md` del 2026-10-17.
- **No se inspeccionaron valores de secretos**: `.env.local` no está trackeado y no se leyó.
- La cobertura se midió con `pnpm test:coverage`; el pipeline `integration` no se ejecutó.

---

## 13. Comandos reproducibles

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --prod
pnpm test:coverage
node -e "…"   # conteos de tablas, migraciones y claves i18n (ver §4)
```
