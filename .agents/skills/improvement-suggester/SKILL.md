---
name: improvement-suggester
description: "AI-powered improvement suggester for Next.js/TypeScript projects. Analyzes codebase patterns and suggests actionable improvements for code quality, performance, architecture, DX, and user experience. Use when seeking optimization opportunities."
category: improvement
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - improvements
  - optimization
  - refactoring
  - best-practices
  - ai-analysis
  - nextjs
  - typescript
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# Improvement Suggester

## Overview

AI-powered analysis that identifies improvement opportunities across code quality, performance, architecture, developer experience, and user experience. Generates prioritized, actionable suggestions with estimated impact.

## When to Use

- Sprint planning (identify technical improvements)
- Pre-launch optimization pass
- Developer experience improvement
- Performance optimization
- Architecture evolution
- Code modernization

## Analysis Process

### Phase 1: Quick Wins Scan

**High impact, low effort improvements:**

```bash
# Unused imports
grep -rn "^import.*from" src/ --include="*.ts" --include="*.tsx" | wc -l

# Console.log leftovers
grep -rn "console\.\(log\|warn\|error\|debug\)" src/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|\.log" | head -20

# Any type usage
grep -rn ": any\|as any\|<any>" src/ --include="*.ts" --include="*.tsx" | head -20

// TODO/FIXME count
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.tsx" | head -20

# Unused variables (if ESLint configured)
pnpm lint 2>&1 | grep "no-unused-vars\|no-unused-imports" | head -20
```

### Phase 2: Pattern Analysis

**Detect anti-patterns and suggest modern alternatives:**

| Pattern Found | Modern Alternative |
|---------------|--------------------|
| `useEffect` for data fetching | React Query / SWR / Server Components |
| `any` type usage | Proper TypeScript types |
| `console.log` in production | Structured logging (e.g., pino) |
| Inline styles | Tailwind CSS classes |
| Class components | Function components + hooks |
| Manual state management | Zustand / React Context |
| `fetch` without caching | `fetch` with `next.revalidate` |
| Repeated logic | Extract to custom hook/util |
| Large components | Split into smaller components |
| String concatenation | Template literals |
| Nested ternaries | Early returns / switch |

### Phase 3: Performance Improvements

```bash
# Find images without optimization
grep -rn "<img " src/ --include="*.tsx" | head -20

# Find missing dynamic imports
grep -rn "import.*from" src/ --include="*.tsx" | grep -v "dynamic\|lazy\|React\.\|next/" | head -20

# Find missing memoization candidates
grep -rn "useMemo\|useCallback\|React\.memo" src/ --include="*.tsx" | wc -l
```

**Performance Improvement Templates:**

```typescript
// ❌ Before: Large component loaded eagerly
import { HeavyChart } from "@/components/HeavyChart";

// ✅ After: Dynamic import with loading state
import dynamic from "next/dynamic";
const HeavyChart = dynamic(() => import("@/components/HeavyChart"), {
  loading: () => <ChartSkeleton />,
  ssr: false,
});

// ❌ Before: Re-rendering on every parent render
function ExpensiveList({ items }) {
  return items.map(item => <ExpensiveItem key={item.id} data={item} />);
}

// ✅ After: Memoized components
const ExpensiveItem = React.memo(({ data }) => {
  return <div>{/* complex rendering */}</div>;
});

// ❌ Before: Fetching in client component
"use client";
useEffect(() => {
  fetch("/api/data").then(r => r.json()).then(setData);
}, []);

// ✅ After: Server Component fetching
async function DataDisplay() {
  const data = await fetchData(); // Server-side, cached
  return <Display data={data} />;
}
```

### Phase 4: DX (Developer Experience) Improvements

| Area | Improvement |
|------|-------------|
| **Error Messages** | Custom error classes with context |
| **Type Safety** | Discriminated unions over type assertions |
| **API Design** | Consistent response format (Result pattern) |
| **Configuration** | Environment variable validation (Zod) |
| **Documentation** | JSDoc on all exported functions |
| **Testing** | Co-located tests, test utilities |
| **Logging** | Structured logging with context |
| **Validation** | Zod schemas shared between client/server |

**DX Templates:**

```typescript
// ❌ Before: Magic strings
if (status === "active") { ... }
if (role === "admin") { ... }

// ✅ After: Enums / Constants
const ProjectStatus = { ACTIVE: "active", INACTIVE: "inactive" } as const;
type ProjectStatus = typeof ProjectStatus[keyof typeof ProjectStatus];

// ❌ Before: Unvalidated env vars
const apiKey = process.env.API_KEY;

// ✅ After: Validated with Zod
import { z } from "zod";
const envSchema = z.object({
  API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
});
const env = envSchema.parse(process.env);

// ❌ Before: Inconsistent API responses
return Response.json({ data: result });
return Response.json({ error: "Failed" });
return Response.json(result);

// ✅ After: Consistent Result pattern
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

return Response.json({ ok: true, data: result });
return Response.json({ ok: false, error: { code: "NOT_FOUND", message: "..." } });
```

### Phase 5: UX Improvements

| Area | Improvement |
|------|-------------|
| **Loading States** | Skeleton screens, not spinners |
| **Error States** | Friendly error pages with recovery |
| **Empty States** | Helpful guidance, not blank screens |
| **Optimistic Updates** | Immediate UI feedback |
| **Error Boundaries** | Graceful degradation |
| **Accessibility** | ARIA labels, keyboard navigation |
| **Responsive Design** | Mobile-first, no horizontal scroll |

### Phase 6: Architecture Improvements

```bash
# Check for missing abstractions
grep -rn "try.*catch" src/ --include="*.ts" | wc -l  # High count = need error utility

# Check for repeated patterns
grep -rn "async.*=>" src/app/api/ --include="*.ts" | head -20  # API route boilerplate

# Check for missing middleware
grep -rn "cookies()\|headers()" src/app/ --include="*.ts" | head -20  # Auth duplication
```

**Architecture Improvement Templates:**

```typescript
// ❌ Before: Auth check duplicated in every route
export async function GET(req: Request) {
  const supabase = createServerClient(cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // ... actual logic
}

// ✅ After: Auth middleware / helper
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async (req, { user }) => {
  // ... actual logic, user already verified
});

// ❌ Before: Try/catch in every server action
export async function createAction(formData: FormData) {
  try {
    // validate, save, return
  } catch (error) {
    return { error: "Something went wrong" };
  }
}

// ✅ After: Result pattern utility
import { Result } from "@/lib/result";

export async function createAction(formData: FormData) {
  return Result.try(async () => {
    // validate, save, return
  });
}
```

## Output Format

```markdown
## Improvement Report

### Summary
- Total suggestions: X
- Quick wins: X
- Performance improvements: X
- Architecture improvements: X
- Estimated total impact: [Low/Medium/High]

### Quick Wins (Do First)
| # | Improvement | File(s) | Impact | Effort |
|---|-------------|---------|--------|--------|

### Performance Improvements
| # | Improvement | Expected Gain | Files | Effort |
|---|-------------|---------------|-------|--------|

### Architecture Improvements
| # | Improvement | Benefit | Scope | Effort |
|---|-------------|---------|-------|--------|

### DX Improvements
| # | Improvement | Benefit | Files | Effort |
|---|-------------|---------|-------|--------|

### Implementation Plan
1. [Immediate: Quick wins]
2. [Short-term: Performance]
3. [Medium-term: Architecture]
```

## Improvement Categories & Scoring

| Category | Weight | Metrics |
|----------|--------|---------|
| Code Quality | 25% | Lint errors, type safety, dead code |
| Performance | 25% | Bundle size, render count, query count |
| Architecture | 20% | Coupling, layer violations, modularity |
| DX | 15% | Error handling, validation, documentation |
| UX | 15% | Loading states, error states, accessibility |

## Limitations

- Suggestions are based on static analysis, not business context
- Some improvements may conflict with each other
- Impact estimates are approximate and context-dependent
