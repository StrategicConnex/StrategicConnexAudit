# Plan de remediación — noUncheckedIndexedAccess (última fase)

**Fecha**: 2026-08-24 · **Estado**: 284/368 errores resueltos (77%) · **Restantes**: 84

## Objetivo

Activar `noUncheckedIndexedAccess` en `tsconfig.json` de forma permanente. Criterio de done:
`npx tsc --noEmit` en 0 errores CON el flag activo + suite vitest 653/653.

## Estado actual

- Flag REVERTIDO temporalmente (CI debe pasar). Los 284 fixes anteriores están commiteados.
- Este plan sustituye al intento de autofix masivo, que fue **revertido por corrupto** (insertaba
  `!` en nombres de propiedad, tras `return` y dentro de llamadas — ver "Anti-patrones").

## Metodología segura (probada en los 284 fixes previos)

1. Activar el flag → `npx tsc --noEmit 2>&1 | Select-String 'error TS'`
2. **Leer la línea real** de cada error antes de tocarla (NUNCA transformar por columna a ciegas)
3. Aplicar el patrón que corresponda:
   - Guard existente (`.length > 0`, `if (match)`) → `arr[0]!` / `m[1]!`
   - Valor opcional con semántica de fallback → `?? 0`, `?? ''`, `?? null`, `?? []`
   - Destructuring de array → defaults: `const [a = '', b = '0'] = x.split('/')`
   - Destructuring de `.returning()` → guard honesto: `if (!record) return/throw/500`
   - Enums de Drizzle → cast a `typeof tabla.col.$inferSelect` (nunca `as any`)
   - Regex: grupos participativos → `m[1]!`; opcionales → `m[1] ?? ''`
4. Validar POR ARCHIVO: tsc + tests del módulo
5. Al llegar a 0: dejar el flag activo, suite completa, commit final

## Anti-patrones (lo que corrompió el autofix — prohibido)

- ❌ Insertar `!` por columna de error de tsc (cae en nombres de variable/propiedad)
- ❌ `return! x`, `prop!: val`, `fn!(args)` — sintaxis inválida o semántica distinta
- ❌ Transformaciones en masa sin leer contexto
- ❌ `as any` para callar el error (usa el tipo real o `unknown` + cast local)

## Lotes sugeridos

### Lote 1 — API routes (~35 errores)
`investigations/route.ts` (15, guard `if (!investigation) return 500` tras el insert),
`public/v1/intelligence` (6), `runs/route.ts` (1), `bulk-scan` (1), `benchmarking` (1),
`export/keywords` (1), `adversary/route.test` (2).

### Lote 2 — Server intelligence (~18)
`ai-router` (2), `sandbox-executor` (2), `scenario-runner` (2), `dispatcher` (1),
`dns-brute` (1), `usage-metering` (2), `osint-executors` (1), `technology-profiler` (2),
`tls-advanced` (1), `siem-exporter` (1), `registry` (1), `shadow-detector` (2).

### Lote 3 — UI + shared (~10)
`security/audit/page.tsx` (6), `OverviewTab` (1), `playground` (1),
`report-utils.ts` (1), `mitre-mapping.ts` (1), `cookie-utils.ts` (1), `pdf-template.tsx` (1).

### Lote 4 — Tests + triggers (~21)
`proxy.test` (6), `trigger/*.test` (~12: destructuring `const [url, init] = calls[0]!`),
`mitre-mapping.test` (4), `push.test` (3), `audit-log.test` (2), `api-auth.test` (1),
`MermaidBlock.test` (2), `MonitoringTab.test` (2), `setup-admin.ts` (1).

### Cierre

1. Verificar que el flag sigue activo en tsconfig.json
2. `npx tsc --noEmit` → 0 · `npx vitest run` → 653/653 · `npx eslint` → 0 errores
3. Commit: `fix(types): activar noUncheckedIndexedAccess definitivo` + push

## Lista completa de errores (dump 2026-08-24, 84 líneas)

```
e2e/pentest-auth-ratelimit.spec.ts(351,12): 'loc' is possibly 'undefined'.
e2e/pentest-auth-ratelimit.spec.ts(351,35): 'loc' is possibly 'undefined'.
src/app/api/benchmarking/route.ts(15,7): Type 'number | undefined' is not assignable to type 'number'.
src/app/api/bulk-scan/route.ts(83,35): Argument of type '{ id: string; ownerId: string | null; createdAt: Date | null; updatedAt: Date | null; projectId: string; title: string; target: string; normalizedTarget: string; targetType: "email" | ... 5 more ... | "cidr"; ... 4 more ...; completedAt: Date | null; } | undefined' is not assignable to parameter of type '{ id: string; ownerId: string | null; createdAt: Date | null; updatedAt: Date | null; projectId: string; title: string; target: string; normalizedTarget: string; targetType: "email" | ... 5 more ... | "cidr"; ... 4 more ...; completedAt: Date | null; }'.
src/app/api/intelligence/adversary/route.test.ts(126,13): Property 'values' does not exist on type '{ table: unknown; values: unknown; where: unknown; } | undefined'.
src/app/api/intelligence/adversary/route.test.ts(126,21): Property 'where' does not exist on type '{ table: unknown; values: unknown; where: unknown; } | undefined'.
src/app/api/intelligence/investigations/route.ts(230,28): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(266,30): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(316,36): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(333,45): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(345,36): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(392,56): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(399,41): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(410,39): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(421,13): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(422,16): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(423,17): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/investigations/route.ts(424,27): 'investigation' is possibly 'undefined'.
src/app/api/intelligence/runs/route.ts(168,22): 'insertedRun' is possibly 'undefined'.
src/app/api/projects/[id]/export/keywords/route.ts(67,33): No overload matches this call.
src/app/api/public/v1/intelligence/route.ts(160,22): 'investigation' is possibly 'undefined'.
src/app/api/public/v1/intelligence/route.ts(161,64): 'investigation' is possibly 'undefined'.
src/app/api/public/v1/intelligence/route.ts(166,13): 'investigation' is possibly 'undefined'.
src/app/api/public/v1/intelligence/route.ts(167,16): 'investigation' is possibly 'undefined'.
src/app/api/public/v1/intelligence/route.ts(172,20): 'investigation' is possibly 'undefined'.
src/app/docs/api/playground/page.tsx(406,38): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/app/security/audit/page.tsx(204,122): 'meta' is possibly 'undefined'.
src/app/security/audit/page.tsx(205,44): 'meta' is possibly 'undefined'.
src/app/security/audit/page.tsx(206,14): 'meta' is possibly 'undefined'.
src/app/security/audit/page.tsx(446,124): 'sev' is possibly 'undefined'.
src/app/security/audit/page.tsx(447,16): 'sev' is possibly 'undefined'.
src/app/security/audit/page.tsx(447,27): 'sev' is possibly 'undefined'.
src/features/dashboard/MermaidBlock.test.tsx(31,25): Object is possibly 'undefined'.
src/features/dashboard/MermaidBlock.test.tsx(46,12): Object is possibly 'undefined'.
src/features/dashboard/report-utils.ts(75,46): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/features/dashboard/tabs/MonitoringTab.test.tsx(179,21): Argument of type 'HTMLElement | undefined' is not assignable to parameter of type 'Document | Node | Element | Window'.
src/features/dashboard/tabs/MonitoringTab.test.tsx(245,21): Argument of type 'HTMLElement | undefined' is not assignable to parameter of type 'Document | Node | Element | Window'.
src/features/dashboard/tabs/OverviewTab.tsx(35,13): 'entry' is possibly 'undefined'.
src/proxy.test.ts(66,27): Object is possibly 'undefined'.
src/proxy.test.ts(74,27): Object is possibly 'undefined'.
src/proxy.test.ts(164,27): Object is possibly 'undefined'.
src/proxy.test.ts(177,18): Object is possibly 'undefined'.
src/proxy.test.ts(178,18): Object is possibly 'undefined'.
src/proxy.test.ts(188,27): Object is possibly 'undefined'.
src/scripts/setup-admin.ts(120,5): Type 'string | undefined' is not assignable to type 'string'.
src/server/ai/ai-router.ts(322,35): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/server/intelligence/adversary/sandbox-executor.ts(127,29): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/server/intelligence/adversary/sandbox-executor.ts(137,36): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/server/intelligence/adversary/scenario-runner.ts(246,35): 'run' is possibly 'undefined'.
src/server/intelligence/adversary/scenario-runner.ts(250,14): 'run' is possibly 'undefined'.
src/server/intelligence/core/dispatcher.ts(70,34): Type 'string | undefined' is not assignable to type 'string'.
src/server/intelligence/discovery/dns-brute.ts(249,56): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/server/intelligence/enterprise/api-auth.test.ts(86,22): Object is possibly 'undefined'.
src/server/intelligence/enterprise/usage-metering.ts(31,7): 'maxQuota' is possibly 'undefined'.
src/server/intelligence/enterprise/usage-metering.ts(52,26): 'maxQuota' is possibly 'undefined'.
src/server/intelligence/executors/osint-executors.ts(139,13): Type 'string | undefined' is not assignable to type 'string'.
src/server/intelligence/executors/technology-profiler.ts(157,34): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/server/intelligence/executors/technology-profiler.ts(166,58): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/server/intelligence/executors/tls-advanced.ts(74,26): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/server/notifications/push.test.ts(127,29): Object is possibly 'undefined'.
src/server/notifications/push.test.ts(133,20): Object is possibly 'undefined'.
src/server/notifications/push.test.ts(147,28): Object is possibly 'undefined'.
src/server/reports/pdf-template.tsx(643,7): Type 'string | undefined' is not assignable to type 'string'.
src/server/security/siem-exporter.ts(138,34): No overload matches this call.
src/shared/data/mitre-mapping.test.ts(35,12): Object is possibly 'undefined'.
src/shared/data/mitre-mapping.test.ts(36,12): Object is possibly 'undefined'.
src/shared/data/mitre-mapping.test.ts(37,12): Object is possibly 'undefined'.
src/shared/data/mitre-mapping.test.ts(38,12): Object is possibly 'undefined'.
src/shared/data/mitre-mapping.ts(165,34): Type 'MitreTechnique | undefined' is not assignable to type 'MitreTechnique | null'.
src/shared/lib/audit-log.test.ts(31,18): Object is possibly 'undefined'.
src/shared/lib/audit-log.test.ts(48,30): Object is possibly 'undefined'.
src/shared/lib/cookie-utils.ts(28,37): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/trigger/audit.trigger.test.ts(114,20): Object is possibly 'undefined'.
src/trigger/audit.trigger.test.ts(140,20): Object is possibly 'undefined'.
src/trigger/audit.trigger.test.ts(158,23): Object is possibly 'undefined'.
src/trigger/audit.trigger.test.ts(173,23): Object is possibly 'undefined'.
src/trigger/audit.trigger.test.ts(195,23): Object is possibly 'undefined'.
src/trigger/monitoring.trigger.test.ts(130,25): Object is possibly 'undefined'.
src/trigger/scheduled-scan.trigger.ts(51,50): 'intervalMs' is possibly 'undefined'.
src/trigger/uptime.trigger.test.ts(103,11): Type '[url: string, init?: RequestInit | undefined] | undefined' must have a '[Symbol.iterator]()' method that returns an iterator.
src/trigger/uptime.trigger.test.ts(108,20): Object is possibly 'undefined'.
src/trigger/uptime.trigger.test.ts(126,20): Object is possibly 'undefined'.
src/trigger/uptime.trigger.test.ts(141,20): Object is possibly 'undefined'.
src/trigger/webhook.trigger.test.ts(111,11): Type '[url: string, init?: RequestInit | undefined] | undefined' must have a '[Symbol.iterator]()' method that returns an iterator.
```

## Otros pendientes fuera de alcance de este plan

- **Upstash Redis**: instancia `fancy-lemur-113941` eliminada (ENOTFOUND). Crear Redis nueva y
  actualizar `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` en Vercel (rate limiting
  distribuido) o aceptar el fallback en memoria por-instancia (actual).
- `COMPETITIVE_GAP_ANALYSIS.md` y `USER_RETENTION_PLAN.md` sin commitear (decisión pendiente:
  mover a docs/ y commitear, o eliminar).
