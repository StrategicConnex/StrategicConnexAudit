# StrategicAudit Pro — Plan Estratégico 4 Semanas

> **Fecha:** 2026-09-18
> **Enfoque:** Bottom-Up (Fix First)
> **Estado:** Aprobado por usuario

---

## Resumen Ejecutivo

Plan de 4 semanas para cerrar deuda técnica, mejorar calidad del código, y entregar features de alto valor: Slack/Teams Alerts y Granular RBAC.

**Métricas objetivo:**
| Métrica | Actual | Objetivo |
|---------|--------|----------|
| Tests fallando | 16 | 0 |
| Cobertura stmts | 29% | 50% |
| Cobertura branches | 22% | 35% |
| Rutas con Zod | ~30% | 100% |
| Roles por proyecto | 1 (owner) | 4 (viewer/editor/admin/owner) |

---

## SEMANA 1: Fix Tests + Error Handling

### 1.1 Fix 16 Tests Restantes

**Causa raíz identificada:** Los tests de `keywords.test.ts` y `reports.test.ts` fallan porque mockean `@/shared/db` con `directDb: {}` (objeto vacío), pero el dev bypass en `authenticatedAction` usa `directDb` directamente como `tx`.

**Solución:**

```typescript
// keywords.test.ts — Mock completo de directDb
vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: { findFirst: vi.fn(async () => txState.projectsFind) },
      keywordTargets: {
        findMany: vi.fn(async () => txState.keywordTargetsFindMany ?? []),
        findFirst: vi.fn(async () => txState.keywordTargetFindFirst),
      },
      rankHistory: { findFirst: vi.fn(async () => txState.rankHistoryFindFirst) },
      competitors: {
        findMany: vi.fn(async () => txState.competitorsFindMany ?? []),
        findFirst: vi.fn(async () => txState.competitorFindFirst),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => txState.gscTotals ?? [{}]),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => txState.insertReturning ?? []),
        })),
        returning: vi.fn(async () => txState.insertReturning ?? []),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  },
}));
```

**Archivos a modificar:**
- `src/app/actions/keywords.test.ts` — Mock completo de `directDb`
- `src/app/actions/reports.test.ts` — Mock completo de `directDb`
- `src/server/ai/seo-report-service.test.ts` — Fix mock data
- `src/server/reports/pdf-template.test.tsx` — Fix assertion
- `src/app/api/ai/healthcheck/route.test.ts` — Fix conteo
- `src/server/security/weekly-digest.test.ts` — Fix mock

### 1.2 Error Handling Patterns

**Nuevo archivo:** `src/shared/lib/result.ts`

```typescript
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

export function map<T, U>(result: Result<T>, fn: (v: T) => U): Result<U> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function flatMap<T, U>(result: Result<T>, fn: (v: T) => Result<U>): Result<U> {
  return result.ok ? fn(result.value) : result;
}
```

**Migración de actions (5 iniciales):**
1. `src/app/actions/audits.ts` — `triggerAudit`, `getAuditStatus`
2. `src/app/actions/keywords.ts` — `listKeywordData`, `addKeywordTarget`
3. `src/app/actions/reports.ts` — `exportKeywordsCSV`

**Entregable Semana 1:**
- ✅ 0 tests fallando
- ✅ `Result<T,E>` type + helpers
- ✅ 5 actions migradas a `Result<T,E>`

---

## SEMANA 2: Code Hygiene + Security Hardening

### 2.1 Code Hygiene

| Acción | Herramienta | Archivos |
|--------|-------------|----------|
| Formateo | Prettier | Todos |
| ESLint strict | `eslint.config.mjs` | Config |
| Dead code | `grep` + manual | -500 líneas estimadas |
| Imports | `eslint-plugin-import` | Todos |
| Barrel files | Manual | `src/shared/types/index.ts` |

### 2.2 Security Hardening

**OWASP Top 10 Coverage:**

| OWASP | Acción | Archivos |
|-------|--------|----------|
| A03:2021 | Zod en TODAS las rutas API | `src/app/api/**/route.ts` |
| A07:2021 | Rate limiting por endpoint | `src/shared/lib/ratelimit.ts` |
| A05:2021 | CSP enforce mode | `src/proxy.ts` |
| A03:2021 | Prepared statements (Drizzle) | Ya implementado |
| A07:2021 | Env var validation al startup | `src/env.ts` (nuevo) |
| A05:2021 | CORS allowlist dinámico | `src/proxy.ts` |

**Nuevo archivo:** `src/env.ts`

```typescript
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  TEAMS_WEBHOOK_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
```

**Entregable Semana 2:**
- ✅ Prettier + ESLint strict
- ✅ 20+ rutas con Zod validation
- ✅ CSP enforce mode
- ✅ Env var validation

---

## SEMANA 3: Performance/DB + Test Coverage

### 3.1 Performance/DB

**Queries a optimizar:**

| Query | Problema | Solución |
|-------|----------|----------|
| `intelligence_findings` | Seq scan sin índice | Índice compuesto `(projectId, severity)` |
| `intelligence_assets` | N+1 en listados | Eager loading con Drizzle relations |
| `audit_logs` | Filtro por fecha lento | Índice `(createdAt)` + partitioning |
| `uptime_logs` | Agregaciones lentas | Materialized view |

**Caching layer:**

```typescript
// src/shared/lib/cache.ts
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export async function cached<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached) return cached;
  const value = await fn();
  await redis.set(key, value, { ex: ttl });
  return value;
}
```

### 3.2 Test Coverage (29% → 50%)

**Tests necesarios:**

| Categoría | Tests | Archivos |
|-----------|-------|----------|
| API Routes | 40 | `src/app/api/**/*.test.ts` |
| Server Actions | 30 | `src/app/actions/**/*.test.ts` |
| DB Queries | 20 | `src/shared/db/**/*.test.ts` |
| Utils/Helpers | 15 | `src/shared/utils/**/*.test.ts` |
| Triggers | 10 | `src/trigger/**/*.test.ts` |
| **Total** | **115** | |

**Entregable Semana 3:**
- ✅ 10+ queries optimizadas
- ✅ Redis caching layer
- ✅ 115+ tests nuevos
- ✅ Cobertura 50%+

---

## SEMANA 4: Features — Slack/Teams Alerts + Granular RBAC

### 4.1 Slack/Teams Alerts

**Estructura:**

```
src/server/integrations/
├── slack/
│   ├── client.ts          # Slack Web API client
│   ├── formatter.ts       # Alert message formatting
│   └── types.ts           # Slack-specific types
├── teams/
│   ├── client.ts          # Teams webhook client
│   ├── formatter.ts       # Adaptive Card formatting
│   └── types.ts           # Teams-specific types
├── shared/
│   ├── alert-manager.ts   # Central alert routing
│   ├── webhook-store.ts   # CRUD de webhooks
│   └── notification-log.ts # Persist delivery status
└── index.ts               # Barrel exports
```

**Tipos de alerta:**

| Tipo | Severidad | Ejemplo |
|------|-----------|---------|
| `vulnerability_found` | 🔴 Critical | "SQL Injection detected in /api/users" |
| `config_warning` | 🟡 Warning | "CORS allowlist too permissive" |
| `scan_completed` | 🟢 Info | "Weekly scan completed for example.com" |
| `weekly_summary` | 📊 Report | "7-day security summary" |

**Flujo:**

```
Trigger.dev Task → Alert Manager → Channel Router
                                    ├── Slack Webhook
                                    ├── Teams Webhook
                                    └── Persist in notification_logs
```

### 4.2 Granular RBAC

**Nuevas tablas:**

```sql
-- Membresía de proyectos
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  invited_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  UNIQUE(project_id, user_id)
);

-- Permisos por rol
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  resource TEXT NOT NULL,
  UNIQUE(role, permission, resource)
);

-- Audit log de acciones
CREATE TABLE audit_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Roles y permisos:**

| Rol | Permisos |
|-----|----------|
| `viewer` | `read:*` |
| `editor` | `read:*`, `scan:execute`, `remediation:propose` |
| `admin` | `read:*`, `scan:*`, `remediation:*`, `members:manage`, `settings:write` |
| `owner` | `*` (all permissions) |

**API endpoints nuevos:**

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/projects/[id]/members` | Listar miembros |
| POST | `/api/projects/[id]/members` | Invitar miembro |
| PATCH | `/api/projects/[id]/members/[userId]` | Cambiar rol |
| DELETE | `/api/projects/[id]/members/[userId]` | Remover miembro |
| GET | `/api/projects/[id]/audit-log` | Ver audit log |

**Entregable Semana 4:**
- ✅ Slack + Teams integration
- ✅ Webhook management UI
- ✅ 4 roles por proyecto
- ✅ Audit log de acciones

---

## Dependencias

| Semana | Dependencias externas |
|--------|----------------------|
| 1 | Ninguna |
| 2 | Ninguna |
| 3 | Redis (Upstash) — ya configurado |
| 4 | Slack API, Teams Webhook URLs |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Tests fallan por mocks complejos | Alta | Medio | Incremental, 1 archivo a la vez |
| RBAC rompe permisos existentes | Media | Alto | Feature flag + migration gradual |
| Slack/Teams API rate limits | Baja | Bajo | Queue + retry logic |

## Métricas de Éxito

| Semana | Métrica | Target |
|--------|---------|--------|
| 1 | Tests fallando | 0 |
| 1 | Actions con `Result<T,E>` | 5 |
| 2 | Rutas con Zod | 100% |
| 2 | CSP mode | enforce |
| 3 | Cobertura stmts | 50% |
| 3 | Queries optimizadas | 10+ |
| 4 | Integraciones | Slack + Teams |
| 4 | Roles por proyecto | 4 |
