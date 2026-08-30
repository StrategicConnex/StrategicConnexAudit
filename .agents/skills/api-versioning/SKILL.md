---
name: api-versioning
description: "Expert in SCAUDIT's public API: versioning (v1), API key management, rate limiting, quota billing, and API documentation. Use when building or modifying the public API layer."
risk: critical
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - api
  - versioning
  - api-keys
  - rate-limiting
  - quota
  - billing
  - public-api
---

# API Versioning & Key Management Expert

Expert in SCAUDIT's public API layer. Covers API versioning strategy, API key lifecycle, rate limiting, quota billing, and API documentation/playground.

## When to Use This Skill

- When working with public API routes (`src/app/api/public/v1/`)
- When managing API keys (`src/app/api/api-keys/`)
- When modifying rate limiting or quota logic
- When building or updating the API docs (`src/app/docs/`)
- When working with the Swagger playground (`src/app/swagger/`)
- When implementing API key usage tracking
- When adding new public API endpoints

## Architecture

```
┌──────────────────────────────────────────────┐
│              Public API Layer                 │
├──────────────────────────────────────────────┤
│                                              │
│  Versioning: /api/public/v1/                 │
│  ├─ /health        (GET)                     │
│  ├─ /intelligence  (GET, POST)               │
│  └─ /...                                    │
│                                              │
│  Authentication: API Keys                    │
│  ├─ Key generation & rotation                │
│  ├─ Key validation middleware                 │
│  └─ Usage tracking                           │
│                                              │
│  Rate Limiting: Upstash Redis                │
│  ├─ Per-key rate limits                      │
│  ├─ Per-endpoint quotas                      │
│  └─ Monthly usage caps                       │
│                                              │
│  Documentation:                              │
│  ├─ /docs (markdown-based)                   │
│  ├─ /swagger (OpenAPI playground)            │
│  └─ Auto-generated from route schemas        │
└──────────────────────────────────────────────┘
```

## API Key Lifecycle

```
1. Creation    → User generates key in dashboard
2. Activation  → Key is active and usable
3. Usage       → Key tracks all API calls
4. Rotation    → Old key revoked, new key generated
5. Expiry      → Key expires after configured period
6. Revocation  → Key manually revoked
```

### Key Schema
```typescript
interface ApiKey {
  id: string;
  projectId: string;
  name: string;
  keyHash: string;          // Hashed, never stored in plaintext
  prefix: string;           // First 8 chars for identification (e.g., "sk_live_...")
  permissions: string[];    // Allowed endpoints/actions
  rateLimit: number;        // Requests per minute
  monthlyQuota: number;     // Max requests per month
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}
```

## Rate Limiting Strategy

### Per-Key Limits
```typescript
// Upstash rate limiter
const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"),  // 10 requests per minute
  analytics: true,
});
```

### Per-Endpoint Quotas
| Endpoint | Default Limit | Burst |
|----------|--------------|-------|
| GET /health | 100/min | 200 |
| GET /intelligence | 30/min | 60 |
| POST /intelligence | 10/min | 20 |

### Monthly Usage Caps
Tracked in `intelligenceUsageEvents` table. Enforced before execution.

## Rate Limit Response

```json
{
  "error": "rate_limit_exceeded",
  "message": "You have exceeded the rate limit. Please wait before making another request.",
  "retryAfter": 45,
  "limit": 30,
  "remaining": 0,
  "reset": "2026-08-29T12:00:00Z"
}
```

## API Documentation (`/docs`)

Markdown-based documentation rendered server-side.

### Structure
```
/docs/
├── page.tsx              # Docs index
├── layout.tsx            # Docs layout with sidebar
├── [...slug]/page.tsx    # Dynamic markdown pages
└── (markdown files in /docs/ directory)
```

### Swagger Playground (`/swagger`)
Interactive API testing interface using swagger-ui-react.

## Adding a New API Endpoint

1. **Create the route** in `src/app/api/public/v1/{resource}/route.ts`
2. **Validate input** with Zod schema
3. **Add API key authentication** middleware
4. **Add rate limiting** configuration
5. **Track usage** in intelligenceUsageEvents
6. **Write tests** (contract tests in `tests/api-contract/`)
7. **Document** the endpoint in `/docs`
8. **Update OpenAPI spec** for Swagger

## Sharp Edges

### Key leakage
**Problem:** API key exposed in client-side code or logs.
**Fix:** Never expose keys in `NEXT_PUBLIC_` env vars. Hash keys before storage. Redact in logs.

### Rate limit bypass
**Problem:** Attacker uses multiple IP addresses to bypass per-key limits.
**Fix:** Use per-project limits in addition to per-key limits. Implement IP-based anomaly detection.

### Quota exhaustion
**Problem:** Legitimate user hits monthly quota and gets blocked.
**Fix:** Send warning emails at 80% and 95% quota. Provide usage dashboard. Allow graceful degradation.

### Version breaking changes
**Problem:** New API version breaks existing integrations.
**Fix:** Additive changes only in existing versions. Breaking changes require new version. Deprecation period of 6 months.

## Validation Checklist

Before modifying API code:

- [ ] API key validation is enforced
- [ ] Rate limiting is configured
- [ ] Input validation with Zod is in place
- [ ] Usage is tracked
- [ ] Error responses follow the standard format
- [ ] Tests cover auth, rate limiting, and happy path
- [ ] Documentation is updated
- [ ] No secrets in response bodies

## Related Skills
- `intelligence-engine` (backend pipeline)
- `rbac-authorization` (permission model)
- `drizzle-orm-expert` (database patterns)
- `zod-validation-expert` (input validation)

## When to Use
- User mentions API, endpoints, versioning, or REST API
- User mentions API keys, authentication, or rate limiting
- User mentions quota, billing, or usage tracking
- User needs to add or modify public API endpoints

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
