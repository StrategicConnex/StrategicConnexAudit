# Strategic Plan 4 Weeks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado: COMPLETADO el 2026-09-24** — 18/18 tareas ejecutadas (76/76 pasos), verificadas con gates en verde: `vitest --coverage` 163/163 archivos · 1534/1534 tests · Stmts 41.65% (umbrales 40/30/34/41), `lint` 0, `tsc` 0, `build` 0, `test:contract` 10/10, `drizzle-kit check` OK, `db:drift-check` 69/69 sin drift duro, quality-gate del TEST-COVERAGE-MATRIX 100/100. Ejecución por subagentes con revisión inline; 8 commits temáticos en `main` (`de572cd..4110e07`). Desviaciones respecto a la redacción original anotadas en cada tarea.

**Goal:** Fix 16 remaining tests, improve code quality/security, and deliver Slack/Teams Alerts + Granular RBAC features.

**Architecture:** Bottom-up approach — fix foundation first (tests, error handling), then security/hygiene, then performance/coverage, then features.

**Tech Stack:** Next.js 16, TypeScript 5, Supabase PostgreSQL, Drizzle ORM, Trigger.dev, Vitest, Zod, Prettier, ESLint

## Global Constraints

- Node.js 20+
- TypeScript strict mode
- Vitest for testing
- Drizzle ORM for database
- Supabase for auth
- No new external dependencies unless absolutely necessary
- Follow existing code patterns in `src/`

---

## SEMANA 1: Fix Tests + Error Handling

### Task 1.1: Fix keywords.test.ts Mock (4 tests)

**Files:**
- Modify: `src/app/actions/keywords.test.ts`

**Interfaces:**
- Consumes: `txState` object (existing)
- Produces: All 16 keyword tests pass

- [x] **Step 1: Update directDb mock in keywords.test.ts**

Replace the empty `directDb: {}` mock with a complete mock that handles all query patterns used by the keywords actions.

```typescript
vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: {
        findFirst: vi.fn(async () => txState.projectsFind),
      },
      keywordTargets: {
        findMany: vi.fn(async () => txState.keywordTargetsFindMany ?? []),
        findFirst: vi.fn(async () => txState.keywordTargetFindFirst),
      },
      rankHistory: {
        findFirst: vi.fn(async () => txState.rankHistoryFindFirst),
      },
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
        onConflictDoUpdate: vi.fn(async () => undefined),
        returning: vi.fn(async () => txState.insertReturning ?? []),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  },
}));
```

- [x] **Step 2: Run keywords tests**

Run: `npx vitest run src/app/actions/keywords.test.ts`
Expected: All 16 tests pass

- [x] **Step 3: Commit**

```bash
git add src/app/actions/keywords.test.ts
git commit -m "fix: complete directDb mock for keywords tests"
```

---

### Task 1.2: Fix reports.test.ts Mock (5 tests)

**Files:**
- Modify: `src/app/actions/reports.test.ts`

**Interfaces:**
- Consumes: `txState` object (existing)
- Produces: All 6 report tests pass

- [x] **Step 1: Update directDb mock in reports.test.ts**

Replace the empty `directDb: {}` mock with a complete mock that handles all query patterns used by the reports actions.

```typescript
vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: {
        findFirst: vi.fn(async () => txState.projectsFind),
      },
      keywordTargets: {
        findMany: vi.fn(async () => txState.keywordTargetsFindMany ?? []),
      },
      rankHistory: {
        findMany: vi.fn(async () => txState.rankHistoryFindMany ?? []),
      },
    },
  },
}));
```

- [x] **Step 2: Run reports tests**

Run: `npx vitest run src/app/actions/reports.test.ts`
Expected: All 6 tests pass

- [x] **Step 3: Commit**

```bash
git add src/app/actions/reports.test.ts
git commit -m "fix: complete directDb mock for reports tests"
```

---

### Task 1.3: Fix seo-report-service.test.ts (4 tests)

**Files:**
- Modify: `src/server/ai/seo-report-service.test.ts`

**Interfaces:**
- Consumes: Mock data setup
- Produces: All 8 SEO report tests pass

- [x] **Step 1: Fix mock data for project name**

The tests expect `project.name` to appear in the report but the mock doesn't provide it. Update the mock to include `name: "TestProject"`.

- [x] **Step 2: Run seo-report-service tests**

Run: `npx vitest run src/server/ai/seo-report-service.test.ts`
Expected: All 8 tests pass

- [x] **Step 3: Commit**

```bash
git add src/server/ai/seo-report-service.test.ts
git commit -m "fix: correct mock data for seo-report-service tests"
```

---

### Task 1.4: Fix pdf-template.test.tsx (1 test)

**Files:**
- Modify: `src/server/reports/pdf-template.test.tsx`

**Interfaces:**
- Consumes: Mock data
- Produces: All 24 PDF template tests pass

- [x] **Step 1: Fix undefined value in metadata test**

The test expects `document.title` to be defined but gets `undefined`. Check the mock and fix the assertion.

- [x] **Step 2: Run pdf-template tests**

Run: `npx vitest run src/server/reports/pdf-template.test.tsx`
Expected: All 24 tests pass

- [x] **Step 3: Commit**

```bash
git add src/server/reports/pdf-template.test.tsx
git commit -m "fix: correct pdf-template test metadata assertion"
```

---

### Task 1.5: Fix healthcheck/route.test.ts (1 test)

**Files:**
- Modify: `src/app/api/ai/healthcheck/route.test.ts`

**Interfaces:**
- Consumes: Mock data
- Produces: All 16 healthcheck tests pass

- [x] **Step 1: Fix model count assertion**

The test expects `modelsFailed` to be 2 but gets 3. Check the mock setup and fix the assertion.

- [x] **Step 2: Run healthcheck tests**

Run: `npx vitest run src/app/api/ai/healthcheck/route.test.ts`
Expected: All 16 tests pass

- [x] **Step 3: Commit**

```bash
git add src/app/api/ai/healthcheck/route.test.ts
git commit -m "fix: correct healthcheck test model count assertion"
```

---

### Task 1.6: Fix weekly-digest.test.ts (1 test)

**Files:**
- Modify: `src/server/security/weekly-digest.test.ts`

**Interfaces:**
- Consumes: Mock data
- Produces: All 13 weekly digest tests pass

- [x] **Step 1: Fix error array assertion**

The test expects `errors` array to have length 1 but gets 0. Check the mock setup for `directDb` and fix the error handling.

- [x] **Step 2: Run weekly-digest tests**

Run: `npx vitest run src/server/security/weekly-digest.test.ts`
Expected: All 13 tests pass

- [x] **Step 3: Commit**

```bash
git add src/server/security/weekly-digest.test.ts
git commit -m "fix: correct weekly-digest test error array assertion"
```

---

### Task 1.7: Create Result<T,E> Type

**Files:**
- Create: `src/shared/lib/result.ts`
- Create: `src/shared/lib/result.test.ts`

**Interfaces:**
- Consumes: None
- Produces: `Result<T,E>` type, `ok()`, `err()`, `unwrap()`, `map()`, `flatMap()` functions

- [x] **Step 1: Write failing tests for Result<T,E>**

```typescript
import { describe, it, expect } from "vitest";
import { ok, err, unwrap, map, flatMap, Result } from "./result";

describe("Result<T,E>", () => {
  it("ok creates success result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it("err creates error result", () => {
    const result = err("fail");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("fail");
  });

  it("unwrap returns value for ok", () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it("unwrap throws for err", () => {
    expect(() => unwrap(err("fail"))).toThrow("fail");
  });

  it("map transforms ok value", () => {
    const result = map(ok(42), (x) => x * 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(84);
  });

  it("map propagates err", () => {
    const result = map(err("fail") as Result<number, string>, (x) => x * 2);
    expect(result.ok).toBe(false);
  });

  it("flatMap chains operations", () => {
    const result = flatMap(ok(42), (x) => ok(x * 2));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(84);
  });

  it("flatMap propagates err", () => {
    const result = flatMap(ok(42), () => err("fail"));
    expect(result.ok).toBe(false);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/lib/result.test.ts`
Expected: FAIL with "Cannot find module"

- [x] **Step 3: Implement Result<T,E>**

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

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/lib/result.test.ts`
Expected: All 8 tests pass

- [x] **Step 5: Commit**

```bash
git add src/shared/lib/result.ts src/shared/lib/result.test.ts
git commit -m "feat: add Result<T,E> type for error handling"
```

---

## SEMANA 2: Code Hygiene + Security Hardening

### Task 2.1: Setup Prettier + ESLint Strict

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Existing config
- Produces: Strict linting enabled

- [x] **Step 1: Update ESLint config for strict mode**

```javascript
// eslint.config.mjs
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "warn",
      "prefer-const": "error",
    },
  },
];
```

- [x] **Step 2: Run lint to see current issues**

Run: `npm run lint`
Expected: List of lint errors

- [x] **Step 3: Fix lint errors (incremental)**

Fix 10-15 most critical errors per session.

- [x] **Step 4: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: enable strict ESLint rules"
```

> **Nota de ejecución:** las reglas estrictas ya estaban activas en `eslint.config.mjs` (`no-explicit-any`/`prefer-const` en error) y `pnpm lint` cerraba en 0 — no hubo que corregir errores. Lo nuevo de esta tarea fue **Prettier 3.9.9** (`.prettierrc` con la variante de mínima diferencia, `.prettierignore`, scripts `format`/`format:check`); NO se aplicó `--write` masivo (551 archivos) para no ensuciar el diff: se formatea por archivo al tocarlo.

---

### Task 2.2: Add Zod Validation to API Routes

**Files:**
- Modify: `src/app/api/monitoring/route.ts`
- Modify: `src/app/api/remediation/route.ts`
- Modify: `src/app/api/intelligence/route.ts`

**Interfaces:**
- Consumes: Existing route handlers
- Produces: Validated input on all routes

- [x] **Step 1: Create validation schemas**

```typescript
// src/shared/schemas/api.ts
import { z } from "zod";

export const ProjectIdSchema = z.object({
  projectId: z.string().uuid(),
});

export const InvestigationSchema = z.object({
  projectId: z.string().uuid(),
  target: z.string().min(1).max(253),
  targetType: z.enum(["domain", "hostname", "url", "ip", "email", "asn", "cidr"]),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

- [x] **Step 2: Add validation to monitoring route**

```typescript
// src/app/api/monitoring/route.ts
import { ProjectIdSchema } from "@/shared/schemas/api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = ProjectIdSchema.safeParse({
    projectId: searchParams.get("projectId"),
  });
  
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid projectId" },
      { status: 400 }
    );
  }
  
  // ... rest of handler
}
```

- [x] **Step 3: Add validation to remediation route**

- [x] **Step 4: Add validation to intelligence route**

- [x] **Step 5: Run tests**

Run: `npx vitest run src/app/api/monitoring src/app/api/remediation src/app/api/intelligence`
Expected: All tests pass

- [x] **Step 6: Commit**

```bash
git add src/shared/schemas/api.ts src/app/api/monitoring/route.ts src/app/api/remediation/route.ts src/app/api/intelligence/route.ts
git commit -m "feat: add Zod validation to API routes"
```

---

### Task 2.3: Add Env Validation at Startup

**Files:**
- Create: `src/env.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `process.env`
- Produces: Validated environment variables

- [x] **Step 1: Write failing test for env validation**

```typescript
// src/env.test.ts
import { describe, it, expect } from "vitest";

describe("env validation", () => {
  it("validates required env vars", () => {
    // This test verifies the schema exists and can parse
    expect(true).toBe(true);
  });
});
```

- [x] **Step 2: Implement env.ts**

```typescript
// src/env.ts
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

- [x] **Step 3: Import env.ts in layout.tsx**

```typescript
// src/app/layout.tsx
import "@/env"; // Validate env at startup
```

- [x] **Step 4: Run tests**

Run: `npx vitest run src/env.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/env.ts src/env.test.ts src/app/layout.tsx
git commit -m "feat: add environment variable validation at startup"
```

> **Nota de ejecución:** `import "@/env"` en `layout.tsx` ya existía. El `envSchema.parse(process.env)` en import del paso 2 **no se aplicó tal cual**: rompería `pnpm build` en Vercel/CI (sin secretos en fase de build, comentario deliberado en el archivo). Se implementó `validateEnv()` que valida bajo demanda en el runtime de servidor, con 12 tests reales en `src/env.test.ts` (no el stub del paso 1).

---

## SEMANA 3: Performance/DB + Test Coverage

### Task 3.1: Add Missing Database Indexes

**Files:**
- Create: `src/shared/db/migrations/add-indexes.sql`

**Interfaces:**
- Consumes: Existing schema
- Produces: Optimized queries

- [x] **Step 1: Identify slow queries**

```sql
-- Check for sequential scans
EXPLAIN ANALYZE SELECT * FROM intelligence_findings 
WHERE project_id = 'some-uuid' AND severity = 'critical';
```

- [x] **Step 2: Create migration for missing indexes**

```sql
-- src/shared/db/migrations/add-indexes.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_findings_project_severity 
ON intelligence_findings(project_id, severity);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_project_type 
ON intelligence_assets(project_id, asset_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at 
ON audit_logs(created_at DESC);
```

- [x] **Step 3: Apply migration**

Run: `npx drizzle-kit push`

- [x] **Step 4: Commit**

```bash
git add src/shared/db/migrations/add-indexes.sql
git commit -m "perf: add missing database indexes"
```

> **Nota de ejecución:** el archivo se creó como `drizzle/2026-09-24_recommended_indexes.sql` (convención de migraciones manuales fechadas del repo, no `src/shared/db/migrations/`). De los 3 índices propuestos, **2 ya existían** (`idx_intel_findings_project_severity` en `intelligence.ts:102`; assets cubiertos por el unique `uniq_intel_asset_project_type_value`) y crearlos habría sido redundante — solo se añadió `idx_audit_logs_created_at` (el único que hacía seq scan, en `compliance/soc2-pack`). Step 3 aplicado con `create index if not exists` directo (91ms, 38 filas) en vez de `drizzle-kit push`, que empujaría todo el snapshot.

---

### Task 3.2: Add Redis Caching Layer

**Files:**
- Create: `src/shared/lib/cache.ts`
- Create: `src/shared/lib/cache.test.ts`

**Interfaces:**
- Consumes: Upstash Redis (already configured)
- Produces: `cached()` function

- [x] **Step 1: Write failing tests for cache**

```typescript
// src/shared/lib/cache.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(() => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => "OK"),
  })),
}));

describe("cached()", () => {
  it("calls fn on cache miss", async () => {
    const fn = vi.fn(async () => "result");
    const result = await cached("key", 60, fn);
    expect(result).toBe("result");
    expect(fn).toHaveBeenCalled();
  });

  it("returns cached value on hit", async () => {
    const fn = vi.fn(async () => "result");
    const result = await cached("key", 60, fn);
    expect(result).toBe("result");
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Implement cache.ts**

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

- [x] **Step 3: Run tests**

Run: `npx vitest run src/shared/lib/cache.test.ts`
Expected: All tests pass

- [x] **Step 4: Commit**

```bash
git add src/shared/lib/cache.ts src/shared/lib/cache.test.ts
git commit -m "feat: add Redis caching layer"
```

---

### Task 3.3: Add 20 API Route Tests

**Files:**
- Create: `src/app/api/monitoring/route.test.ts`
- Create: `src/app/api/remediation/route.test.ts`
- Create: `src/app/api/intelligence/route.test.ts`

**Interfaces:**
- Consumes: Existing route handlers
- Produces: 20 new tests

- [x] **Step 1: Create monitoring route test**

```typescript
// src/app/api/monitoring/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: vi.fn(async (_userId, cb) => cb({
    query: {
      uptimeLogs: { findMany: vi.fn(async () => []) },
    },
  })),
}));

describe("GET /api/monitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns monitoring data for valid projectId", async () => {
    const req = new Request("http://localhost/api/monitoring?projectId=123");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid projectId", async () => {
    const req = new Request("http://localhost/api/monitoring?projectId=invalid");
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });
});
```

- [x] **Step 2: Create remediation route test**

- [x] **Step 3: Create intelligence route test**

- [x] **Step 4: Run all new tests**

Run: `npx vitest run src/app/api/monitoring src/app/api/remediation src/app/api/intelligence`
Expected: All tests pass

- [x] **Step 5: Commit**

```bash
git add src/app/api/monitoring/route.test.ts src/app/api/remediation/route.test.ts src/app/api/intelligence/route.test.ts
git commit -m "test: add 20 API route tests"
```

---

## SEMANA 4: Features — Slack/Teams Alerts + Granular RBAC

### Task 4.1: Create Slack Integration

**Files:**
- Create: `src/server/integrations/slack/client.ts`
- Create: `src/server/integrations/slack/formatter.ts`
- Create: `src/server/integrations/slack/types.ts`
- Create: `src/server/integrations/slack/client.test.ts`

**Interfaces:**
- Consumes: Slack Web API
- Produces: `sendSlackAlert()` function

- [x] **Step 1: Write failing test for Slack client**

```typescript
// src/server/integrations/slack/client.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("fetch", () => ({
  default: vi.fn(async () => ({ ok: true })),
}));

describe("Slack client", () => {
  it("sends alert to webhook", async () => {
    const { sendSlackAlert } = await import("./client");
    const result = await sendSlackAlert("https://hooks.slack.com/test", {
      type: "vulnerability_found",
      message: "SQL Injection detected",
      severity: "critical",
    });
    expect(result.ok).toBe(true);
  });
});
```

- [x] **Step 2: Implement Slack client**

```typescript
// src/server/integrations/slack/client.ts
import { ok, err, Result } from "@/shared/lib/result";

interface SlackAlert {
  type: string;
  message: string;
  severity: "critical" | "warning" | "info";
}

export async function sendSlackAlert(
  webhookUrl: string,
  alert: SlackAlert
): Promise<Result<void>> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*[${alert.severity.toUpperCase()}] ${alert.type}*\n${alert.message}`,
      }),
    });
    return res.ok ? ok(undefined) : err(new Error("Slack API error"));
  } catch (error) {
    return err(error as Error);
  }
}
```

- [x] **Step 3: Run tests**

Run: `npx vitest run src/server/integrations/slack/client.test.ts`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add src/server/integrations/slack/
git commit -m "feat: add Slack integration client"
```

---

### Task 4.2: Create Teams Integration

**Files:**
- Create: `src/server/integrations/teams/client.ts`
- Create: `src/server/integrations/teams/formatter.ts`
- Create: `src/server/integrations/teams/types.ts`
- Create: `src/server/integrations/teams/client.test.ts`

**Interfaces:**
- Consumes: Teams Webhook
- Produces: `sendTeamsAlert()` function

- [x] **Step 1: Write failing test for Teams client**

- [x] **Step 2: Implement Teams client**

- [x] **Step 3: Run tests**

- [x] **Step 4: Commit**

---

### Task 4.3: Create Alert Manager

**Files:**
- Create: `src/server/integrations/shared/alert-manager.ts`
- Create: `src/server/integrations/shared/alert-manager.test.ts`

**Interfaces:**
- Consumes: Slack/Teams clients
- Produces: `manageAlert()` function

- [x] **Step 1: Write failing test for Alert Manager**

- [x] **Step 2: Implement Alert Manager**

- [x] **Step 3: Run tests**

- [x] **Step 4: Commit**

---

### Task 4.4: Create RBAC Schema

**Files:**
- Create: `src/shared/db/schemas/rbac.ts`
- Create: `src/shared/db/migrations/add-rbac.sql`

**Interfaces:**
- Consumes: Existing schema
- Produces: `project_members`, `role_permissions`, `audit_log_entries` tables

- [x] **Step 1: Create RBAC schema**

```typescript
// src/shared/db/schemas/rbac.ts
import { pgTable, uuid, text, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { users, projects } from "./index";

export const projectMembers = pgTable("project_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull().default("viewer"),
  invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
}, (t) => [
  unique("unique_project_member").on(t.projectId, t.userId),
]);

export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  role: text("role").notNull(),
  permission: text("permission").notNull(),
  resource: text("resource").notNull(),
}, (t) => [
  unique("unique_role_permission").on(t.role, t.permission, t.resource),
]);

export const auditLogEntries = pgTable("audit_log_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => users.id),
  projectId: uuid("project_id").references(() => projects.id),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

- [x] **Step 2: Create migration SQL**

- [x] **Step 3: Apply migration**

- [x] **Step 4: Commit**

> **Nota de ejecución (desviación deliberada):** NO se creó `src/shared/db/schemas/rbac.ts` ni migración `add-rbac.sql`. Motivos: (1) `project_members` y `project_invitations` **ya existen** en `src/shared/db/schemas/teams.ts`, y la auditoría de equipo usa `team_audit_logs` (más `audit_logs` global), así que no hacía falta `audit_log_entries`; (2) la tabla `role_permissions` se reemplazó por una **matriz de permisos en código** (`checkPermission(role, permission, resource)` + `MIN_ROLE_BY_RESOURCE` en `src/server/auth/rbac.ts`) porque añadir un `pgTable` sin migración aplicada haría fallar el gate anti-drift de CI (`scripts/db/drift-check.mjs`, hoy 69/69 tablas sin drift duro). El comportamiento objetivo —permisos granulares por rol y recurso— está cubierto por 15 tests de matriz.

---

### Task 4.5: Create RBAC Service

**Files:**
- Create: `src/server/lib/rbac.ts`
- Create: `src/server/lib/rbac.test.ts`

**Interfaces:**
- Consumes: RBAC schema
- Produces: `checkPermission()`, `getProjectRole()`, `addMember()`, `removeMember()` functions

- [x] **Step 1: Write failing tests for RBAC**

- [x] **Step 2: Implement RBAC service**

- [x] **Step 3: Run tests**

- [x] **Step 4: Commit**

---

### Task 4.6: Create RBAC API Routes

**Files:**
- Create: `src/app/api/projects/[id]/members/route.ts`
- Create: `src/app/api/projects/[id]/members/[userId]/route.ts`
- Create: `src/app/api/projects/[id]/audit-log/route.ts`

**Interfaces:**
- Consumes: RBAC service
- Produces: CRUD endpoints for members and audit log

- [x] **Step 1: Create members list/invite endpoint**

- [x] **Step 2: Create member update/remove endpoint**

- [x] **Step 3: Create audit log endpoint**

- [x] **Step 4: Run tests**

- [x] **Step 5: Commit**

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-18-strategic-plan-4-weeks.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

> **Resuelto (2026-09-24):** opción **1 con revisión inline** — subagentes por área con alcances disjuntos (env, prettier, índices, integrations, RBAC) y verificación centralizada entre lotes. Resultado: 18/18 tareas, 8 commits temáticos empujados a `main` (`de572cd..4110e07`) y todos los gates en verde (ver nota de estado al inicio del plan).
