# Plan: Remediación Integral de Deuda Técnica — StrategicAudit Pro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir la totalidad de la deuda técnica detectada en la auditoría del 2026-08-23: despliegue seguro de los fixes de seguridad, higiene TypeScript (`any`→`unknown`), consolidación de implementaciones duplicadas de intelligence, división de `IntelligenceTab.tsx`, eliminación de código muerto, rendimiento RLS, eliminación de N+1 restantes y enforcement de scopes de API keys.

**Architecture:** Trabajo por fases independientes con validación completa (`tsc` + `eslint` + `vitest`) al cierre de cada tarea. Los cambios de BD son migraciones SQL idempotentes numeradas secuencialmente (0026+). Los refactors de UI extraen hojas primero (bottom-up) manteniendo el contrato de render en cada commit.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Drizzle ORM + Postgres (Supabase) · Vitest · ESLint flat config

## Global Constraints

- `pnpm` como package manager. NO existe binario `rtk` en este equipo — usar comandos plain.
- Validación mínima antes de cada commit: `npx tsc --noEmit` (exit 0) y `npx vitest run` (642+ tests en verde).
- Migraciones SQL: SIEMPRE idempotentes (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, bloques `DO $$`). Numeración continua desde `0025`.
- No introducir dependencias nuevas sin justificación en la tarea.
- Los mensajes de error de API pública son contrato: no cambiar strings que tests o clientes consumen salvo que la tarea lo indique.
- Commits convencionales: `fix:` / `refactor:` / `perf:` / `test:` / `chore:`. Solo commitear cuando el operador lo apruebe (regla del repo).

---

## FASE 0 — Despliegue de los fixes de seguridad (OPS)

> Prerrequisito: los cambios de la sesión del 2026-08-23 están mergeados. Esta fase NO requiere código nuevo.

### Task 0.1: Variables de entorno en Vercel

- [ ] **Step 1:** Verificar en Vercel → Settings → Environment Variables que existen y tienen valor en Production:
  - `SCAUDIT_WEBHOOK_SECRET` (sin ella el webhook CI/CD devuelve 503 desde el fix C-1)
  - `CRON_SECRET` (crons fail-closed desde el fix M-4)
- [ ] **Step 2:** Smoke test post-deploy:
  ```bash
  # Debe devolver 401 (no 200):
  curl -s -o /dev/null -w "%{http_code}\n" https://<prod-url>/api/cron/siem
  # Con secreto debe devolver 200:
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CRON_SECRET" https://<prod-url>/api/cron/siem
  ```
  Expected: `401` y `200`.

### Task 0.2: Rol admin de plataforma para operadores

- [ ] **Step 1:** Ejecutar en Supabase SQL Editor (rol postgres):
  ```sql
  UPDATE users SET role = 'admin' WHERE email IN ('<email-operador-1>', '<email-operador-2>');
  ```
- [ ] **Step 2:** Verificar que el operador ve `/security/audit` con datos y que una cuenta `client` recibe 403 en `/api/security/audit-logs`.

### Task 0.3: Aplicar migración 0025 y verificar RLS

- [ ] **Step 1:** Backup previo (Supabase → Database → Backups) o `pg_dump`.
- [ ] **Step 2:** Aplicar: `npx drizzle-kit migrate`. Expected: aplica `0025_rls_core_defense_in_depth` sin errores.
- [ ] **Step 3:** Verificación SQL en Supabase (debe devolver las 4 tablas + 3 funciones + relisplolicy=true en projects/users):
  ```sql
  SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity
    ORDER BY tablename;
  SELECT proname FROM pg_proc WHERE pronamespace='public'
    AND proname IN ('current_auth_uid','user_has_project_access','current_user_is_platform_admin');
  ```
- [ ] **Step 4:** Regresión funcional: ejecutar flujo E2E de `/intelligence` (crear investigación, verla en UI) y `/projects` — deben funcionar igual que antes (Drizzle corre como superuser, RLS no le afecta).

---

## FASE 1 — Higiene TypeScript (`any` → `unknown`)

> ~146 ocurrencias de `any` (56 son `catch (error: any)`). Estrategia: util central + regla ESLint en `warn` + burn-down por directorios.

### Task 1.1: Utilidad `getErrorMessage`

**Files:**
- Create: `src/shared/lib/errors.ts`
- Test: `src/shared/lib/errors.test.ts`

**Interfaces:**
- Produces: `getErrorMessage(error: unknown): string` — usado por todas las tareas siguientes.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/errors.test.ts
import { describe, it, expect } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("extrae message de Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });
  it("devuelve el string si error es string", () => {
    expect(getErrorMessage("fallo plano")).toBe("fallo plano");
  });
  it("devuelve fallback para valores no serializables", () => {
    expect(getErrorMessage({ weird: true })).toBe("Error desconocido");
    expect(getErrorMessage(undefined)).toBe("Error desconocido");
    expect(getErrorMessage(null)).toBe("Error desconocido");
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/shared/lib/errors.test.ts` — Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implement**

```ts
// src/shared/lib/errors.ts
/** Extrae un mensaje legible de un valor unknown capturado en catch. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  if (typeof error === "string") return error;
  return "Error desconocido";
}
```

- [ ] **Step 4:** Run test — Expected: PASS (3/3).
- [ ] **Step 5:** Commit: `git add src/shared/lib/errors.ts src/shared/lib/errors.test.ts && git commit -m "feat: add getErrorMessage util for unknown catches"`

### Task 1.2: Activar ESLint `no-explicit-any: warn` global

**Files:**
- Modify: `eslint.config.mjs`

- [ ] **Step 1:** En el bloque principal de `rules` (junto a `no-unused-vars`) añadir:
```js
"@typescript-eslint/no-explicit-any": "warn",
```
- [ ] **Step 2:** En el bloque override de intelligence (líneas 22-40), cambiar `"off"` → eliminar la línea (hereda `warn`). Mantener `react-hooks/set-state-in-effect: off`.
- [ ] **Step 3:** Baseline: `npx eslint . 2>&1 | Select-String '"warning"' | Measure-Object | % Count` — anotar número (esperado ~100-150 warnings). NO deben ser errores: `npx eslint . ; echo $LASTEXITCODE` exit 0.
- [ ] **Step 4:** Commit: `git commit -am "chore: enable no-explicit-any warn globally"`

### Task 1.3: Burn-down de `catch (error: any)` en rutas API

**Files (batch por directorio, un commit por batch):**
- Modify: todos los ficheros de `src/app/api/**/route.ts` con `catch (error: any)` / `catch (err: any)` (localizar con `rg "catch \((error|err|e): any\)" src/app/api`)

Patrón mecánico (repetir por cada match):

```ts
// ANTES
} catch (error: any) {
  console.error("GET /foo failure:", error.message);
// DESPUÉS
} catch (error: unknown) {
  console.error("GET /foo failure:", getErrorMessage(error));
```

con `import { getErrorMessage } from "@/shared/lib/errors";` añadido al top.

- [ ] **Step 1:** Batch `src/app/api/intelligence/**`: aplicar patrón, `npx tsc --noEmit`, `npx vitest run src/app/api/intelligence` → verde. Commit: `refactor(api): unknown catches + getErrorMessage in intelligence routes`
- [ ] **Step 2:** Batch `src/app/api/{security,cron,notifications,telemetry,webhooks,auth}/**`: ídem. Commit ídem sufijo.
- [ ] **Step 3:** Batch `src/server/**` y `src/trigger/**` (mismo grep). Commit.
- [ ] **Step 4:** Verificar cero restantes: `rg "catch \((error|err|e): any\)" src/` → sin resultados.

### Task 1.4: Tipar `api/intelligence/investigations/route.ts` (17 `any`)

**Files:**
- Modify: `src/app/api/intelligence/investigations/route.ts`
- Test: existentes en mismo directorio (si hay, correrlos; si no, Step 1 añade uno)

- [ ] **Step 1:** Añadir test de contrato del agregado (el endpoint consolida findings + toolRuns):

```ts
it("agrega findings por toolId y calcula score", async () => {
  // mockear directDb/query según mocks ya presentes en el fichero de test del route
  // llamar GET con ?projectId=<uuid> auth válido
  // expect(body.data.findings[0]).toMatchObject({ severity: expect.any(String), confidence: expect.anything() });
});
```
(Adaptar a los mocks existentes del suite del route; el objetivo es fijar la forma de respuesta ANTES del cambio de tipos.)
- [ ] **Step 2:** Reemplazar declaraciones: `const allFindings: any[]` → `const allFindings: IntelligenceFinding[]`; `toolRunRecords: any[]` → `IntelligenceToolRun[]`; lambdas `(f: any)` → `(f: IntelligenceFinding)`; importar tipos de `@/shared/db/schemas` (ya exportados desde la sesión anterior).
- [ ] **Step 3:** `npx tsc --noEmit` → 0 errores (ajustar accesos a campos que el tipo canónico marca opcionales usando `??`).
- [ ] **Step 4:** `npx vitest run src/app/api/intelligence/investigations` → PASS.
- [ ] **Step 5:** Commit: `refactor(api): canonical drizzle types in investigations route`

---

## FASE 2 — Consolidación de implementaciones duplicadas de intelligence

### Task 2.1: Adoptar tipos canónicos en `useInvestigationRealtime.ts`

**Files:**
- Modify: `src/features/intelligence/hooks/useInvestigationRealtime.ts`

- [ ] **Step 1:** Reemplazar interfaces locales por aliases del schema (mantener nombres locales para minimizar diff):
```ts
import type {
  IntelligenceInvestigation,
  IntelligenceFinding,
  IntelligenceRunEvent,
} from "@/shared/db/schemas";

export type InvestigationData = Pick<IntelligenceInvestigation,
  "id" | "projectId" | "title" | "target" | "normalizedTarget" | "status" | "score"> & {
  metadata: Record<string, unknown>;
};
export type FindingData = IntelligenceFinding;
export type RunEventData = IntelligenceRunEvent;
```
- [ ] **Step 2:** `npx tsc --noEmit` → corregir consumidores que accedan a campos inexistentes (usar campos canónicos: `recommendation`, `confidence` como string numérica, etc.).
- [ ] **Step 3:** `npx vitest run src/features` → PASS. Commit: `refactor(features): canonical types in realtime hook`

### Task 2.2: Eliminar `AttackSurfaceGraph` duplicado (versión SVG)

**Files:**
- Delete: `src/app/components/AttackSurfaceGraph.tsx` (394 líneas, SVG propio)

- [ ] **Step 1:** Verificar referencias: `rg "AttackSurfaceGraph" src/ --glob '!**/features/**'`. Si solo aparece su propia definición → eliminar. Si hay imports, redirigirlos a `@/features/intelligence/components/AttackSurfaceGraph` (versión reactflow usada por /intelligence) verificando props compatibles; ajustar call-sites.
- [ ] **Step 2:** `npx tsc --noEmit && npx vitest run` → verde.
- [ ] **Step 3:** Commit: `refactor(ui): remove duplicated SVG AttackSurfaceGraph`

### Task 2.3: Unificar cliente browser de Supabase en `useRealtimeMetrics`

**Files:**
- Modify: `src/shared/hooks/useRealtimeMetrics.ts:12-15`

- [ ] **Step 1:** Sustituir `createBrowserClient(...)` inline por el singleton:
```ts
import { createClient } from "@/shared/lib/supabase/client";
// dentro del hook:
const supabase = createClient();
```
- [ ] **Step 2:** `npx vitest run src/shared/hooks` → PASS. Commit: `refactor(hooks): reuse supabase browser singleton`

---

## FASE 3 — División de `IntelligenceTab.tsx` (~2.650 líneas)

> Objetivo: contenedor ≤300 líneas. Extracción bottom-up: primero hojas sin estado, luego secciones con estado local, al final hooks de datos. Cada paso compila y pasa tests. Usar los tipos canónicos de Fase 2.

**Target tree (Create bajo `src/app/components/tabs/intelligence/`):**
```
types.ts                  — re-export de canónicos + tipos UI residuales (SeverityColorMap…)
constants.ts              — colores por severidad, labels de categorías, tool icons
useIntelligenceData.ts    — hook fetch investigations+findings+assets+history (useState/useEffect hoy en el tab)
FindingsTable.tsx         — lista/tabla de hallazgos con filtro por severidad
AssetsPanel.tsx           — lista de activos descubiertos
GeoSection.tsx            — wrapper client que hace dynamic(() => import("@/app/components/GeoMap"))
HistoryList.tsx           — historial de investigaciones
InvestigationDetail.tsx   — panel de detalle (metadata parseada: spf/dmarc/asn) — consume FindingsTable+AssetsPanel
IntelligenceTab.tsx       — MOVIDO/REDUCIDO: orquesta selección + layout (≤300 líneas)
```

**Interfaces clave ( Producidas ):**
```ts
// types.ts
export type Severity = "info" | "low" | "medium" | "high" | "critical";
// useIntelligenceData.ts
export function useIntelligenceData(projectId: string): {
  investigations: IntelligenceInvestigation[];
  selected: IntelligenceInvestigation | null;
  select: (id: string) => void;
  loading: boolean;
};
// InvestigationDetail.tsx
export function InvestigationDetail({ investigation }: { investigation: IntelligenceInvestigation }): JSX.Element;
```

### Task 3.1: Extraer `constants.ts` + `types.ts`
- [ ] Mover mapas de color/label/iconos literales del tab. `tsc` + commit `refactor(ui): extract intelligence tab constants`.

### Task 3.2: Extraer `HistoryList.tsx`
- [ ] Copiar JSX+handlers de historial, props `{ items, onSelect, activeId }`. Wire en tab original. Build + `npx vitest run` + commit.

### Task 3.3: Extraer `FindingsTable.tsx` y `AssetsPanel.tsx`
- [ ] Props tipadas con `IntelligenceFinding[]` / `IntelligenceAsset[]`. Eliminar casts `as any` asociados. Build + commit.

### Task 3.4: Extraer `GeoSection.tsx`
- [ ] Mover lógica `(asnGeo as any)?.ipv4` → tipar metadata: definir en `types.ts`:
```ts
export interface AsnGeoMetadata { ipv4?: Array<{ ip?: string; country?: string; city?: string }>; }
```
y leer con narrowing en vez de `as any`. Build + commit.

### Task 3.5: Extraer `InvestigationDetail.tsx` + `useIntelligenceData.ts`
- [ ] Mover estado principal (selected/loading/fetch) al hook; el panel consume el objeto canónico. Reducir `IntelligenceTab.tsx` a composición.
- [ ] Verificación final: `Get-Content src/app/components/tabs/IntelligenceTab.tsx | Measure-Object -Line` ≤ 300; `wc` de nuevos ficheros ≤400 líneas cada uno.
- [ ] `npx tsc --noEmit && npx vitest run && npx eslint src/app/components/tabs` → 0 errores/warnings nuevos. Commit: `refactor(ui): split IntelligenceTab into focused modules`.

---

## FASE 4 — Eliminación de código muerto

### Task 4.1: Borrar scaffolding vacío `src/modules/*`

- [ ] **Step 1:** Confirmar vacío: `Get-ChildItem src/modules -Recurse -File | Measure-Object` → Count 0.
- [ ] **Step 2:** `Remove-Item -Recurse -Force src/modules` y grep de referencias en docs: `rg "src/modules" AGENTS.md docs README.md DESIGN*.md` — actualizar menciones a "(planificado, no implementado)" o eliminar.
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Commit: `chore: remove empty DDD module scaffolding`.

### Task 4.2: Eliminar `createAdminClient` muerto

- [ ] **Step 1:** Verificar 0 referencias: `rg "createAdminClient|supabase/admin" src scripts` → solo `admin.ts`.
- [ ] **Step 2:** `git rm src/shared/lib/supabase/admin.ts`. Si `docs/database/SUPABASE-AUDIT.md` lo menciona como disponible, actualizar nota ("eliminado 2026-08; usar script setup-admin propio").
- [ ] **Step 3:** `guard:secrets`: `pnpm guard:secrets` → PASS (menos superficie service-role). Commit: `chore(security): remove unused supabase admin client`.

---

## FASE 5 — Rendimiento RLS: policies sobre helper SECURITY DEFINER

> Las policies 0016–0024 subquean projects+project_members por fila. Reemplazar predicado por `public.user_has_project_access(project_id)` (creada en 0025, STABLE, SECURITY DEFINER vía owner postgres → evalúa sin recursión y permite initplan).

### Task 5.1: Migración 0026

**Files:**
- Create: `drizzle/0026_rls_policy_perf_helpers.sql`
- Modify: `drizzle/meta/_journal.json` (añadir entry idx 26, version 7, breakpoints true, when = <epoch ms actual>)

Contenido (idempotente; repetir bloque por tabla con project_id directo):

```sql
-- Tablas con project_id directo:
-- uptime_logs, anomaly_detections, adversary_engagements,
-- intelligence_findings, intelligence_assets, intelligence_investigations,
-- intelligence_tool_runs, audits, keyword_targets, integration_data_gsc
DROP POLICY IF EXISTS "<tabla>_select_member_or_owner" ON <tabla>;
CREATE POLICY "<tabla>_select_member_or_owner" ON <tabla>
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));

-- Tablas SIN project_id (subquery por FK, predicado interno vía helper):
DROP POLICY IF EXISTS "intelligence_run_events_select_member_or_owner" ON intelligence_run_events;
CREATE POLICY "intelligence_run_events_select_member_or_owner" ON intelligence_run_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM intelligence_investigations i
      WHERE i.id = intelligence_run_events.investigation_id
        AND public.user_has_project_access(i.project_id)
    )
  );
-- análogo: crawl_results (vía audits.audit_id), rank_history (vía keyword_targets.keyword_id),
-- adversary_task_nodes (vía adversary_engagements.engagement_id → project_id),
-- intelligence_findings.toolRunId policy INSERT (0023) mantener WITH CHECK pero sustituir subquery interna.
-- NO tocar: project_members_select_own (self-only), policies INSERT/UPDATE de 0023 cuyo WITH CHECK
-- usa el mismo patrón → sustituir subquery por helper igual que SELECT.
```

- [ ] **Step 1:** Escribir 0026 con TODAS las tablas listadas arriba (leer 0016/0017/0022/0023/0024 para copiar nombres exactos de policy en los DROP IF EXISTS).
- [ ] **Step 2:** Actualizar `_journal.json` (idx 26).
- [ ] **Step 3:** Aplicar contra staging/local: `npx drizzle-kit migrate`.
- [ ] **Step 4:** Smoke test de aislamiento (SQL editor, transacción):
```sql
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','<uuid-owner>','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT count(*) FROM intelligence_findings;  -- filas de SUS proyectos
ROLLBACK;
```
Comparar conteos pre/post 0026 (deben coincidir). Repetir con un user member de project_members.
- [ ] **Step 5:** EXPLAIN sanity: `EXPLAIN SELECT * FROM intelligence_findings WHERE project_id='<uuid>';` → plan usa index `idx_intel_findings_project_severity` sin subplan por fila.
- [ ] **Step 6:** Suite completa local + commit: `perf(db): rewrite RLS policies over security definer access helper`.

---

## FASE 6 — N+1 y queries pesadas restantes

### Task 6.1: `looker-studio/route.ts` — 4 queries por proyecto → 4 queries TOTALES agrupadas

**Files:**
- Modify: `src/app/api/looker-studio/route.ts` (bloque `activeProjects.map(... Promise.all([...4 selects]))`, ~líneas 160-215)

- [ ] **Step 1:** Test de forma: si existe suite del route, correrla para fijar shape; si no, añadir test mínimo que mockee directDb y afirme `{ rows: [...], columns }` estable tras refactor (patrón de mocks de `route.test.ts` vecinos).
- [ ] **Step 2:** Reemplazar: recolectar `ids = activeProjects.map(p=>p.id)` y ejecutar UNA query por métrica con agregación:
```ts
const gscRows = await tx
  .select({
    projectId: integrationDataGsc.projectId,
    clicks: sql<number>`sum(${integrationDataGsc.clicks})`,
    impressions: sql<number>`sum(${integrationDataGsc.impressions})`,
  })
  .from(integrationDataGsc)
  .where(inArray(integrationDataGsc.projectId, ids))
  .groupBy(integrationDataGsc.projectId);
// análogo: ga4 (activeUsers/conversions), audits (count por status), keywordTargets (count)
const byProject = new Map(gscRows.map(r => [r.projectId, r]));
```
y ensamblar el payload por proyecto leyendo los Maps.
- [ ] **Step 3:** `npx vitest run src/app/api/looker-studio && npx tsc --noEmit` → verde. Commit: `perf(api): batch looker-studio aggregates per metric instead of per project`.

### Task 6.2: `dns-history.ts` — 1 query por record type → 1 query total

**Files:**
- Modify: `src/server/intelligence/history/dns-history.ts:130-150`

- [ ] **Step 1:** Sustituir bucle `for (const {recordType} of types)` por:
```ts
const snapshots = await directDb
  .select()
  .from(dnsHistory)
  .where(and(
    eq(dnsHistory.projectId, projectId),
    eq(dnsHistory.query, query),
    inArray(dnsHistory.recordType, types.map(t => t.recordType)),
  ))
  .orderBy(desc(dnsHistory.snapshotDate));
// agrupar en JS por recordType y tomar primeros 2 de cada grupo para detectar cambio
```
Mantener la semántica exacta de detección de cambios (comparación de values ordenados).
- [ ] **Step 2:** Tests del módulo (si existen `dns-history.test.ts`) → PASS; si no, añadir caso: dos snapshots mismo type ⇒ `changed:false`; values distintos ⇒ `changed:true`. Commit: `perf(intelligence): single query dns-history change detection`.

### Task 6.3: `cron/uptime` — pool de concurrencia + insert masivo

**Files:**
- Modify: `src/app/api/cron/uptime/route.ts` (bucle secuencial ~líneas 30-95)
- Test: `src/app/api/cron/uptime/route.test.ts` (existentes)

- [ ] **Step 1:** Refactor: acumular `pendingLogs: (typeof uptimeLogs.$inferInsert)[]` durante el bucle y hacer UN insert al final:
```ts
if (pendingLogs.length > 0) {
  await db.insert(uptimeLogs).values(pendingLogs);
}
```
Concurrencia acotada (K=5) con worker pool sencillo:
```ts
const CONCURRENCY = 5;
let cursor = 0;
async function worker() {
  while (cursor < activeProjects.length) {
    const project = activeProjects[cursor++];
    await checkProject(project); // push a pendingLogs, sin escribir BD
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
```
- [ ] **Step 2:** `npx vitest run src/app/api/cron/uptime` → PASS (mocks de insert pueden necesitar aceptar arrays). Commit: `perf(cron): pooled uptime checks with bulk log insert`.

---

## FASE 7 — Enforcement de scopes de API keys

### Task 7.1: Soporte de scope en `withPublicApi`

**Files:**
- Modify: `src/server/api/public-router.ts`
- Test: `src/server/api/public-router.test.ts` (nuevo)

**Interfaces:**
- Produces: `withPublicApi(handler, opts?: { requiredScope?: string })` — default sin requisito (retro-compatible). Wildcard `*` en key.scope otorga todo.

- [ ] **Step 1: Write the failing test** (mocks estilo `public/v1/route.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuthenticate = vi.fn();
vi.mock("@/shared/lib/api-keys", () => ({ authenticateApiKey: mockAuthenticate }));
vi.mock("@/shared/db", () => ({
  directDb: { insert: () => ({ values: () => ({ catch: () => Promise.resolve() }) }) },
}));
vi.mock("@/shared/db/schemas", () => ({ securityAuditLogs: {} }));

function req() {
  return new NextRequest(new Request("http://localhost/x", { headers: { authorization: "Bearer sa_live_x" } }));
}

describe("withPublicApi scopes", () => {
  let mod: typeof import("./public-router");
  beforeEach(async () => { vi.clearAllMocks(); mod = await import("./public-router"); });

  it("key sin scope requerido pasa", async () => {
    mockAuthenticate.mockResolvedValue({ authenticated: true, userId: "u1", keyRecord: { id: "k1", name: "n", scope: [] } });
    const handler = vi.fn(async () => mod.apiSuccess({}));
    await mod.withPublicApi(handler)(req());
    expect(handler).toHaveBeenCalled();
  });

  it("key sin el scope exigido → 403", async () => {
    mockAuthenticate.mockResolvedValue({ authenticated: true, userId: "u1", keyRecord: { id: "k1", name: "n", scope: ["reports"] } });
    const handler = vi.fn(async () => mod.apiSuccess({}));
    const res = await mod.withPublicApi(handler, { requiredScope: "intelligence" })(req());
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("wildcard * otorga acceso", async () => {
    mockAuthenticate.mockResolvedValue({ authenticated: true, userId: "u1", keyRecord: { id: "k1", name: "n", scope: ["*"] } });
    const handler = vi.fn(async () => mod.apiSuccess({}));
    const res = await mod.withPublicApi(handler, { requiredScope: "intelligence" })(req());
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/server/api/public-router.test.ts` → FAIL (opts ignorado).
- [ ] **Step 3:** Implement:

```ts
interface WithPublicApiOptions { requiredScope?: string }

export function withPublicApi(handler: RouteHandler, opts?: WithPublicApiOptions) {
  return async (req: NextRequest, params?: unknown): Promise<NextResponse> => {
    const authResult = await authenticateApiKey(req);
    if (!authResult.authenticated) { /* ...igual que hoy... */ }

    if (opts?.requiredScope) {
      const scopes = (authResult.keyRecord?.scope ?? []) as string[];
      const allowed = scopes.includes("*") || scopes.includes(opts.requiredScope);
      if (!allowed) {
        return NextResponse.json({
          success: false,
          error: `API key lacks required scope '${opts.requiredScope}'`,
          documentation_url: "https://scaudit.vercel.app/docs/api",
        }, { status: 403 });
      }
    }
    /* ...resto igual... */
```

- [ ] **Step 4:** Run tests → PASS (3/3 + regresión de suites públicas).
- [ ] **Step 5:** Aplicar en consumidores: `src/app/api/public/v1/intelligence/route.ts` → `withPublicApi(handler, { requiredScope: "intelligence" })` en GET y POST.
- [ ] **Step 6:** Suite completa + commit: `feat(api): enforce api-key scopes via withPublicApi options`.

---

## Gates finales (cierre del plan)

- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npx eslint .` → exit 0, warnings `no-explicit-any` reducidos ≥80% vs baseline de Task 1.2
- [ ] `npx vitest run` → 642+ tests PASS (incluye los añadidos por este plan)
- [ ] `pnpm guard:secrets && pnpm guard:cdn` → PASS
- [ ] `rg "catch \((error|err|e): any\)" src/` → 0 matches
- [ ] `Get-ChildItem src/modules` → no existe
- [ ] Migraciones 0025 y 0026 aplicadas en producción + smoke SQL documentado en PR description

## Fuera de alcance (requieren decisión de producto, no incluir aquí)

- Dividir `security/audit/page.tsx` (1.319 líneas) y `SettingsTab/MonitoringTab` (>800): aplicar el MISMO método de Fase 3 en un plan futuro.
- Server Actions → migración a Route Handlers o protectedAction (`src/shared/lib/actions/safe-action.ts` existe sin uso).
- Decisión de producto sobre `/intelligence` (shell features) vs dashboard tab como única superficie.
