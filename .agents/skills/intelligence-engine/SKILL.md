---
name: intelligence-engine
description: "Expert in the SCAUDIT intelligence engine core: circuit breaker, cache, rate limiter, risk engine, tool registry, dispatcher, concurrency control, and scan response patterns. Use when building or modifying intelligence pipeline components."
risk: critical
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - intelligence
  - circuit-breaker
  - cache
  - rate-limiter
  - risk-engine
  - tool-registry
  - resilience
---

# Intelligence Engine Expert

Expert in the SCAUDIT intelligence engine core infrastructure. Covers the resilience, caching, dispatching, and risk assessment patterns that power the intelligence pipeline.

## When to Use This Skill

- When modifying or extending the tool registry (`src/server/intelligence/registry/tool-registry.ts`)
- When working with the circuit breaker (`src/server/intelligence/core/circuit-breaker.ts`)
- When implementing or tuning the rate limiter (`src/server/intelligence/core/rate-limiter.ts`)
- When building the risk engine (`src/server/intelligence/core/risk-engine.ts`)
- When adding new intelligence tools or executors
- When debugging cache behavior (`src/server/intelligence/core/cache.ts`)
- When working with the dispatcher or concurrency control
- When modifying scan response patterns

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              Intelligence Pipeline              │
├─────────────────────────────────────────────────┤
│  Dispatcher ──► Tool Registry ──► Executor      │
│       │              │                │         │
│  Concurrency    Circuit Breaker   Rate Limiter  │
│       │              │                │         │
│  Risk Engine ◄─── Cache ◄──── Scan Response     │
└─────────────────────────────────────────────────┘
```

## Core Components

### Tool Registry (`registry/tool-registry.ts`)

Central catalog of all intelligence tools. Each tool has:
- `id`: unique identifier
- `category`: grouping (dns, web, osint, vulnerability, etc.)
- `costUnits`: quota cost per execution
- `handler`: async function that executes the tool
- `schema`: Zod schema for input validation

**Adding a new tool:**
```typescript
// 1. Define the tool in the registry
registry.register({
  id: "new-tool-id",
  category: "dns",
  costUnits: 1,
  schema: z.object({ target: z.string() }),
  handler: async (input, context) => {
    // Implementation
    return { data: result };
  },
});

// 2. Create a trigger task in src/trigger/
// 3. Add API route if needed in src/app/api/intelligence/
// 4. Write tests in a co-located .test.ts file
```

### Circuit Breaker (`core/circuit-breaker.ts`)

Protects against cascading failures when external tools/APIs are down.

**States:** CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)

**Configuration:**
```typescript
const breaker = new CircuitBreaker({
  failureThreshold: 5,      // failures before opening
  recoveryTimeoutMs: 30000, // time before half-open
  monitorWindowMs: 60000,   // sliding window for failures
});
```

**Rules:**
- Never bypass the circuit breaker for external API calls
- Log state transitions for observability
- Set appropriate timeouts per tool category
- Monitor breaker state in health checks

### Rate Limiter (`core/rate-limiter.ts`)

Prevents overwhelming external services and staying within API quotas.

**Configuration:**
```typescript
const limiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000,          // 1 minute window
  keyGenerator: (input) => input.target, // per-target limiting
});
```

**Rules:**
- Always rate limit external API calls
- Use per-target and per-user rate limiting
- Return structured rate limit errors (HTTP 429)
- Respect `Retry-After` headers from upstream

### Risk Engine (`core/risk-engine.ts`)

Calculates risk scores for findings and assets.

**Scoring factors:**
- Severity weight (critical=10, high=7, medium=4, low=1)
- Asset criticality (internet-facing, contains PII, etc.)
- Exposure window (how long the issue has existed)
- Exploitability (CVSS-like scoring)

**Rules:**
- Risk scores are 0-100
- Critical findings (score > 80) trigger immediate alerts
- Scores are persisted in `intelligenceFindings.riskScore`
- Never hardcode risk thresholds — make them configurable

### Cache (`core/cache.ts`)

In-memory cache with TTL support for tool results.

**Configuration:**
```typescript
const cache = new IntelligenceCache({
  defaultTtlMs: 300_000,    // 5 minutes
  maxSize: 1000,            // max entries
  evictionPolicy: "lru",
});
```

**Cache key pattern:** `{toolId}:{normalizedTarget}:{hash(input)}`

**Rules:**
- Cache tool results to avoid redundant external calls
- Use shorter TTL for volatile data (DNS, uptime)
- Use longer TTL for stable data (WHOIS, certificates)
- Never cache error responses
- Invalidate cache on explicit user request

### Concurrency Control (`core/concurrency.ts`)

Limits parallel executions to prevent resource exhaustion.

```typescript
const semaphore = new Semaphore({
  maxConcurrent: 5,
  queueTimeoutMs: 30000,
});
```

### Dispatcher (`core/dispatcher.ts`)

Orchestrates tool execution through the full pipeline:

```
Input → Policy Check → Rate Limit → Circuit Breaker → Cache Check → Execute → Risk Score → Store
```

**Rules:**
- Always go through the dispatcher for tool execution
- Never call tools directly, bypassing the pipeline
- Log every execution with timing and result metadata
- Handle partial failures gracefully (some tools may fail while others succeed)

### Scan Response (`core/scan-response.ts`)

Standardized response format for all intelligence scans:

```typescript
interface ScanResponse {
  success: boolean;
  findings: IntelligenceFinding[];
  assets: IntelligenceAsset[];
  metadata: {
    toolId: string;
    durationMs: number;
    cached: boolean;
    costUnits: number;
  };
  errors: Array<{ toolId: string; error: string }>;
}
```

### Health Checker (`core/health-checker.ts`)

Monitors the health of all registered tools and external dependencies.

- Checks tool availability on a configurable interval
- Updates circuit breaker state based on health
- Provides dashboard visibility into tool health
- Triggers alerts when tools become unavailable

### Policy Enforcer (`core/policy-enforcer.ts`)

Enforces rules before tool execution:
- Target validation (blocked domains, allowed categories)
- Quota enforcement (per-project, per-user limits)
- Legal consent verification (`activeTestingAuthorized` for adversary tools)
- Time-of-day restrictions for aggressive scans

## Adding a New Intelligence Tool (Full Workflow)

1. **Define the tool** in `registry/tool-registry.ts`
2. **Create the executor** in `executors/` if needed
3. **Add the trigger task** in `src/trigger/`
4. **Create API route** in `src/app/api/intelligence/`
5. **Write unit tests** co-located with the tool
6. **Add integration tests** in the route test file
7. **Update the catalog** if it's a new category
8. **Document the tool** in the tool catalog

## Common Patterns

### Tool Execution with Full Pipeline
```typescript
const response = await dispatcher.execute({
  toolId: "dns-brute",
  target: "example.com",
  projectId: project.id,
  userId: user.id,
  options: { maxDepth: 2 },
});
```

### Adding Rate Limits to a New API
```typescript
// In the route handler
const rateLimitResult = await rateLimiter.check({
  key: `intelligence:${userId}`,
  cost: tool.costUnits,
});

if (!rateLimitResult.allowed) {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter: rateLimitResult.retryAfter },
    { status: 429 }
  );
}
```

## Sharp Edges

### Circuit breaker stuck open
**Problem:** After a brief outage, the breaker stays open and blocks all requests.
**Fix:** Ensure `recoveryTimeoutMs` is configured and the half-open state properly tests recovery with a single probe request.

### Cache stampede
**Problem:** Many concurrent requests for the same uncached key all hit the external API.
**Fix:** Use a lock/mutex pattern — first request fetches, others wait for the cache to be populated.

### Rate limiter drift
**Problem:** Distributed rate limiting across serverless functions shows incorrect counts.
**Fix:** Use Upstash Redis for distributed rate limiting (already integrated via `@upstash/ratelimit`).

### Risk score miscalculation
**Problem:** Risk scores don't reflect actual severity because factors are weighted incorrectly.
**Fix:** Review the weighting formula and ensure severity, asset criticality, and exploitability are all considered.

## Validation Checklist

Before modifying intelligence engine code:

- [ ] All external calls go through the dispatcher
- [ ] Rate limiting is configured for new external APIs
- [ ] Circuit breaker has appropriate thresholds
- [ ] Cache TTL matches data volatility
- [ ] Risk scoring formula is documented
- [ ] Concurrency limits prevent resource exhaustion
- [ ] Tests cover happy path, errors, and edge cases
- [ ] Health checks include new tools

## When to Use
- User mentions intelligence pipeline, tool execution, or scanning
- User mentions circuit breaker, rate limiter, cache, or risk scoring
- User needs to add a new intelligence tool or modify existing ones
- User asks about resilience patterns or failure handling

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
