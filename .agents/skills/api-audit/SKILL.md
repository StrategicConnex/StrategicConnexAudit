---
name: api-audit
description: "API audit for Next.js server actions, Route Handlers, and REST endpoints. Reviews authentication, authorization, input validation, error handling, rate limiting, and security headers. Use when auditing API design or security."
category: audit
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - api
  - rest
  - server-actions
  - nextjs
  - authentication
  - rate-limiting
  - validation
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# API Audit

## Overview

Comprehensive API audit for Next.js applications covering server actions, Route Handlers, middleware, authentication, authorization, input validation, error handling, rate limiting, and security headers.

## When to Use

- API security review
- Pre-production API hardening
- Authentication/authorization audit
- Rate limiting configuration
- Input validation gaps
- Error handling review

## Audit Process

### Phase 1: Endpoint Discovery

```bash
# Find all API routes
find src/app/api -name "route.ts" -o -name "route.tsx" | head -30

# Find all server actions
grep -rn "use server" src/ --include="*.ts" --include="*.tsx" | head -30

# Find middleware
cat src/middleware.ts 2>/dev/null | head -50
```

### Phase 2: Authentication Audit

**Auth Checklist:**

| Area | Check |
|------|-------|
| **Session Management** | Supabase SSR properly configured, tokens refreshed |
| **Protected Routes** | All non-public routes check auth |
| **Middleware** | Auth middleware runs before handlers |
| **Token Validation** | JWT verified on every request |
| **Logout** | Session properly destroyed |
| **Cookie Security** | httpOnly, secure, sameSite set |

```bash
# Find unprotected routes
find src/app/api -name "route.ts" | while read f; do
  echo "=== $f ==="
  grep -l "getUser\|getSession\|auth\|supabase" "$f" 2>/dev/null || echo "⚠️  NO AUTH CHECK"
done

# Find server actions without auth
grep -rn "use server" src/ --include="*.ts" -l | while read f; do
  echo "=== $f ==="
  grep -l "getUser\|getSession\|auth" "$f" 2>/dev/null || echo "⚠️  NO AUTH CHECK"
done
```

### Phase 3: Authorization Audit

**RBAC Checklist:**
- [ ] User can only access their own resources
- [ ] Admin routes are protected
- [ ] Team/project-level permissions enforced
- [ ] No IDOR (Insecure Direct Object Reference)
- [ ] RLS policies complement application-level auth

```bash
# Check for IDOR patterns (direct param access without ownership check)
grep -rn "params\.\|searchParams\." src/app/api/ --include="*.ts" | head -20

# Check for ownership verification
grep -rn "userId.*===\|ownerId.*===\|createdBy.*===" src/ --include="*.ts" | head -20
```

### Phase 4: Input Validation

```bash
# Find all request body parsing
grep -rn "await.*request\.json\|await.*request\.text\|formData\|searchParams" src/app/ --include="*.ts" | head -30

# Find Zod schemas
grep -rn "z\.object\|z\.string\|z\.number\|z\.array" src/ --include="*.ts" | head -30
```

**Validation Checklist:**
- [ ] All inputs validated with Zod schemas
- [ ] Body size limits set
- [ ] URL params validated
- [ ] Query params sanitized
- [ ] File upload validated (type, size)
- [ ] SQL injection prevention (Drizzle parameterized queries)
- [ ] No `eval()` or dynamic code execution with user input

**Validation Template:**
```typescript
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  url: z.string().url().max(2048),
  description: z.string().max(2000).optional(),
});

export async function createProject(input: unknown) {
  const validated = createProjectSchema.parse(input); // Throws on invalid
  // ... safe to use validated.name, validated.url
}
```

### Phase 5: Error Handling

```bash
# Find error handling patterns
grep -rn "try.*catch\|\.catch\|error\|Error" src/app/ --include="*.ts" | head -30

# Find console.log in API routes (leaks info)
grep -rn "console\.\(log\|error\|warn\)" src/app/api/ --include="*.ts" | head -20
```

**Error Handling Checklist:**
- [ ] No sensitive data in error responses
- [ ] Consistent error response format
- [ ] Proper HTTP status codes
- [ ] Database errors don't leak schema details
- [ ] Auth errors don't reveal user existence
- [ ] Rate limit errors return proper 429 status
- [ ] Validation errors return field-level details
- [ ] No unhandled promise rejections

**Secure Error Response:**
```typescript
// ✅ Secure: Generic message
return NextResponse.json(
  { error: "Invalid credentials" },
  { status: 401 }
);

// ❌ Insecure: Reveals user existence
return NextResponse.json(
  { error: "User not found" },  // Attacker knows email doesn't exist
  { status: 404 }
);
```

### Phase 6: Rate Limiting

```bash
# Check rate limiting configuration
grep -rn "ratelimit\|rate.*limit\|throttle" src/ --include="*.ts" | head -20

# Check Upstash configuration
grep -rn "upstash\|Redis" src/ --include="*.ts" | head -20
```

**Rate Limiting Checklist:**
- [ ] Rate limiting on authentication endpoints
- [ ] Rate limiting on write operations
- [ ] Different limits for different user tiers
- [ ] IP-based limiting for anonymous requests
- [ ] User-based limiting for authenticated requests
- [ ] Proper 429 response with Retry-After header

### Phase 7: Security Headers

```bash
# Check security headers in next.config.ts
cat next.config.ts | head -50

# Check middleware headers
grep -rn "headers\|security\|helmet" src/middleware.ts 2>/dev/null | head -20
```

**Required Security Headers:**
- [ ] `Strict-Transport-Security` (HSTS)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `X-XSS-Protection: 0` (modern browsers use CSP)
- [ ] `Content-Security-Policy`
- [ ] `Referrer-Policy`
- [ ] `Permissions-Policy`

## Output Format

```markdown
## API Audit Report

### Summary
- Endpoints analyzed: X
- Server actions analyzed: X
- Issues found: X critical, X warnings

### Endpoint Inventory
| Endpoint | Method | Auth | Validation | Rate Limit | Status |
|----------|--------|------|------------|------------|--------|

### Security Issues
| Endpoint | Issue | Severity | Fix |
|----------|-------|----------|-----|

### Authentication/Authorization
[Findings]

### Input Validation
[Findings]

### Error Handling
[Findings]

### Rate Limiting
[Findings]

### Recommendations
[Prioritized action items]
```

## Limitations

- Static analysis cannot test runtime auth flows
- Rate limiting effectiveness requires load testing
- RLS policies need Supabase context for full validation
