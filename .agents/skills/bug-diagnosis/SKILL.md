---
name: bug-diagnosis
description: "Systematic bug diagnosis and root cause analysis for Next.js/TypeScript projects. Uses scientific method to identify root causes before proposing fixes. Covers runtime errors, build failures, type errors, and integration issues."
category: debugging
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - debugging
  - root-cause
  - error-analysis
  - nextjs
  - typescript
  - troubleshooting
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# Bug Diagnosis

## Overview

Systematic bug diagnosis methodology. **Always find root cause before proposing fixes.** Symptom fixes are failures that create new bugs.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed the investigation phase, you cannot propose fixes.

## When to Use

- Any error or unexpected behavior
- Test failures
- Build failures
- Runtime errors in production
- Performance regressions
- Integration issues
- "It works on my machine" problems

## Diagnosis Process

### Phase 1: Error Collection

**DO NOT skip reading the error message.**

```bash
# 1. Read the full error
cat dev_error.log 2>/dev/null | tail -50

# 2. Check for type errors
npx tsc --noEmit 2>&1 | head -50

# 3. Check for lint errors
pnpm lint 2>&1 | head -50

# 4. Check for build errors
pnpm build 2>&1 | tail -100

# 5. Check recent git changes
git log --oneline -10
git diff HEAD~3 --stat
```

**Error Reading Checklist:**
- [ ] Read the FULL error message (not just the first line)
- [ ] Note the exact file path and line number
- [ ] Note the error type/code
- [ ] Read the stack trace completely
- [ ] Check if it's a known error (search the message)

### Phase 2: Reproduction

```bash
# Can you reproduce it?
# 1. Run the exact command that fails
# 2. Note the exact steps
# 3. Check if it's intermittent

# Check if it's environment-specific
node -v
pnpm -v
cat .env.local | grep -v "^#" | sed 's/=.*/=***/'  # Show env vars (redacted)
```

**Reproduction Rules:**
- If not reproducible → gather more data, don't guess
- If intermittent → add logging, run multiple times
- If environment-specific → compare environments

### Phase 3: Hypothesis Formation

**Before trying fixes, form hypotheses:**

| Hypothesis | How to Test |
|------------|-------------|
| Type error | `npx tsc --noEmit` |
| Import error | Check import paths, barrel exports |
| Environment variable missing | Check `.env.local` vs `.env.example` |
| Race condition | Add logging, check timing |
| Cache issue | Clear `.next`, `node_modules/.cache` |
| Dependency issue | `pnpm install`, check lockfile |
| RLS/permission issue | Check Supabase policies |
| API endpoint changed | Check API docs, network tab |

### Phase 4: Root Cause Tracing

**Backward tracing technique:**

```
Error occurs at line X
  ↓ Who calls line X?
    ↓ What data does it receive?
      ↓ Where does that data come from?
        ↓ Is that data correct at source?
          ↓ If not → ROOT CAUSE FOUND
          ↓ If yes → Continue tracing
```

**Multi-component diagnosis:**

```bash
# Add diagnostic logging at each component boundary:

# Layer 1: Client
echo "=== Client state ==="
# Log the data being sent

# Layer 2: Server Action / API Route
echo "=== Server received ==="
# Log what the server receives

# Layer 3: Database
echo "=== Database query ==="
# Log the actual query being executed

# Layer 4: Response
echo "=== Server response ==="
# Log what's being returned
```

### Phase 5: Common Next.js Bug Patterns

#### Build Errors

```bash
# Module not found
# Fix: Check import paths, tsconfig paths, barrel exports
grep -rn "from.*@/\|from.*\.\./" src/ --include="*.ts" | head -20

# Hydration mismatch
# Fix: Ensure server and client render the same thing
grep -rn "use client\|useEffect\|useState" src/ --include="*.tsx" | head -20

# Dynamic server usage
# Fix: Add proper caching or make route dynamic
grep -rn "cookies()\|headers()" src/app/ --include="*.ts" | head -20
```

#### Runtime Errors

```bash
# Cannot read property of undefined
# Fix: Add null checks, optional chaining
grep -rn "\.\(map\|filter\|find\|forEach\)" src/ --include="*.tsx" | head -20

# Next.js API route errors
# Fix: Check request/response handling
grep -rn "export.*async.*function.*GET\|export.*async.*function.*POST" src/app/api/ --include="*.ts" | head -20

# Supabase auth errors
# Fix: Check session management
grep -rn "supabase.*auth\|createServerClient\|cookies" src/ --include="*.ts" | head -20
```

#### Database Errors

```bash
# Drizzle query errors
# Fix: Check schema, column names, types
grep -rn "\.findMany\|\.findFirst\|\.execute" src/ --include="*.ts" | head -20

# Connection errors
# Fix: Check connection string, pool config
grep -rn "connectionString\|pool\|DATABASE_URL" src/ drizzle.config.ts 2>/dev/null | head -10
```

### Phase 6: Fix Validation

**After applying a fix, ALWAYS verify:**

```bash
# 1. Type check
npx tsc --noEmit

# 2. Lint
pnpm lint

# 3. Unit tests
pnpm test

# 4. Build
pnpm build

# 5. Manual verification
# Reproduce the original issue → should be fixed
# Check for regressions → no new issues
```

**Fix Validation Checklist:**
- [ ] Original error is resolved
- [ ] No new type errors
- [ ] No new lint warnings
- [ ] Existing tests still pass
- [ ] Build succeeds
- [ ] No unintended side effects

## Output Format

```markdown
## Bug Diagnosis Report

### Error Summary
- Error: [exact error message]
- Location: [file:line]
- Frequency: [always/intermittent/rare]

### Root Cause
[Clear explanation of WHY the error occurs]

### Evidence
[Logs, traces, comparisons that prove the root cause]

### Fix
[Exact code changes needed]

### Verification
[How to confirm the fix works]

### Prevention
[How to prevent this class of bug in the future]
```

## Quick Reference: Error Codes

| Error | Common Cause | Fix |
|-------|-------------|-----|
| `HYDRATION_MISMATCH` | Server/client render diff | Use `useEffect` for client-only |
| `MODULE_NOT_FOUND` | Wrong import path | Check `tsconfig.json` paths |
| `NEXT_REDIRECT` | Redirect in wrong context | Use `useRouter` in client |
| `NEXT_NOT_FOUND` | Missing `not-found.tsx` | Add 404 page |
| `AUTH_REQUIRED` | Missing auth check | Add session verification |
| `RLS_DENIED` | RLS policy blocking | Check Supabase policies |
| `QUERY_TIMEOUT` | Slow query | Add index, optimize query |
| `CONNECTION_CLOSED` | Pool exhausted | Reduce concurrent queries |

## Limitations

- Cannot diagnose issues that don't reproduce
- Some bugs require production access to diagnose
- Race conditions may need specialized debugging tools
