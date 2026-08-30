---
name: database-audit
description: "Database audit for Drizzle ORM + PostgreSQL: schema design, migration safety, query performance, RLS policies, connection pooling, and data integrity. Use when reviewing database architecture or optimizing queries."
category: audit
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - database
  - drizzle
  - postgresql
  - supabase
  - rls
  - migration
  - query-optimization
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# Database Audit

## Overview

Comprehensive database audit for Drizzle ORM + PostgreSQL/Supabase projects. Covers schema design, migration safety, query patterns, RLS policies, connection management, and data integrity.

## When to Use

- Schema review before migration deployment
- Query performance investigation
- Data integrity concerns
- RLS policy review
- Connection pooling issues
- Pre-production database hardening

## Audit Process

### Phase 1: Schema Design Review

```bash
# Find all schema files
find src/ drizzle/ -name "*.ts" | xargs grep -l "pgTable\|pgSchema" 2>/dev/null

# Check for migration files
ls drizzle/ 2>/dev/null | head -20
```

**Schema Checklist:**

| Area | Check |
|------|-------|
| **Primary Keys** | UUID vs SERIAL — UUID for distributed, SERIAL for auto-increment |
| **Foreign Keys** | All relationships have explicit FK constraints |
| **Indexes** | Indexes on foreign keys, filter columns, sort columns |
| **Unique Constraints** | Composite unique where appropriate |
| **NOT NULL** | Required fields are NOT NULL with defaults |
| **Timestamps** | created_at, updated_at on all tables |
| **Soft Delete** | deleted_at pattern if needed (not hard deletes) |
| **Data Types** | Correct types (TEXT vs VARCHAR, INTEGER vs BIGINT) |
| **Naming** | snake_case for columns, plural for tables |

### Phase 2: Migration Safety

```bash
# Check migration files
cat drizzle/*.sql 2>/dev/null | head -100

# Look for dangerous patterns
grep -rn "DROP TABLE\|DROP COLUMN\|ALTER COLUMN.*TYPE\|TRUNCATE" drizzle/ 2>/dev/null
```

**Migration Safety Rules:**

| Rule | Risk Level | Description |
|------|------------|-------------|
| No DROP COLUMN in same migration as code deploy | 🔴 Critical | Code may still reference dropped column |
| No ALTER COLUMN TYPE without data migration | 🔴 Critical | Data loss possible |
| Add column with DEFAULT first, then remove | 🟡 Warning | Zero-downtime pattern |
| Create index CONCURRENTLY | 🟡 Warning | Prevents table locks |
| Test rollback before deploy | 🟡 Warning | Every migration must be reversible |

**Safe Migration Pattern:**
```sql
-- Step 1: Add new column (nullable, no default)
ALTER TABLE users ADD COLUMN email_normalized TEXT;

-- Step 2: Backfill data
UPDATE users SET email_normalized = LOWER(email);

-- Step 3: Add NOT NULL constraint
ALTER TABLE users ALTER COLUMN email_normalized SET NOT NULL;

-- Step 4: Add unique constraint
ALTER TABLE users ADD CONSTRAINT users_email_normalized_unique UNIQUE (email_normalized);
```

### Phase 3: Query Pattern Analysis

```bash
# Find all database queries
grep -rn "\.findMany\|\.findFirst\|\.findUnique\|\.execute\|\.select\|\.insert\|\.update\|\.delete" src/ --include="*.ts" | head -50

# Check for N+1 patterns
grep -rn "for.*await\|forEach.*await" src/ --include="*.ts" | head -20
```

**Query Anti-patterns:**

```typescript
// ❌ N+1 query pattern
const projects = await db.query.projects.findMany();
for (const project of projects) {
  project.audits = await db.query.audits.findMany({
    where: eq(audits.projectId, project.id)
  });
}

// ✅ Use include/with
const projects = await db.query.projects.findMany({
  with: { audits: true }
});

// ❌ Selecting all columns when you need 2
const users = await db.query.users.findMany();

// ✅ Select only what you need
const users = await db.query.users.findMany({
  columns: { id: true, name: true, email: true }
});

// ❌ Missing pagination
const results = await db.query.items.findMany();

// ✅ Paginated query
const results = await db.query.items.findMany({
  limit: 50,
  offset: page * 50,
  orderBy: [desc(items.createdAt)]
});
```

### Phase 4: Row Level Security (Supabase)

```bash
# Find RLS policies
grep -rn "CREATE POLICY\|ALTER POLICY\|enable_rls\|RLS" drizzle/ scripts/ 2>/dev/null | head -30

# Check if RLS is enabled
grep -rn "enableRLS\|is_rls_enabled" drizzle/ 2>/dev/null
```

**RLS Audit Checklist:**
- [ ] RLS enabled on ALL tables with user data
- [ ] No permissive policies (use restrictive)
- [ ] Policies check auth.uid() or JWT claims
- [ ] No `true` as policy condition (allows all)
- [ ] Service role bypass is intentional
- [ ] Policies are tested with different roles
- [ ] No data leakage between tenants (multi-tenant)

**RLS Policy Template:**
```sql
-- ✅ Secure: Users can only see their own data
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (user_id = auth.uid());

-- ✅ Secure: Team-based access
CREATE POLICY "Team members can view projects"
  ON projects FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

-- ❌ Insecure: Allows all
CREATE POLICY "Anyone can view"
  ON projects FOR SELECT
  USING (true);
```

### Phase 5: Connection & Pooling

```bash
# Check connection configuration
grep -rn "pool\|max.*connections\|idleTimeout\|connectionString" src/ drizzle.config.ts 2>/dev/null

# Check for connection leaks
grep -rn "\.execute\|\.transaction" src/ --include="*.ts" | wc -l
```

**Connection Audit:**
- [ ] Connection pool configured (max: 10-20 for serverless)
- [ ] Idle timeout set (30s for serverless)
- [ ] Connection timeout configured
- [ ] No connection leaks (connections released after use)
- [ ] Transactions are properly committed/rolled back
- [ ] Supabase connection pooling via Transaction mode (port 6543)

## Output Format

```markdown
## Database Audit Report

### Summary
- Tables analyzed: X
- Queries reviewed: X
- Issues found: X critical, X warnings

### Schema Issues
| Table | Issue | Severity | Fix |
|-------|-------|----------|-----|

### Query Performance
| Query | Issue | Impact | Fix |
|-------|-------|--------|-----|

### RLS Policies
| Table | Policy | Status | Issue |
|-------|--------|--------|-------|

### Migration Risks
| Migration | Risk | Mitigation |
|-----------|------|------------|

### Recommendations
[Prioritized action items]
```

## Performance Thresholds

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Query count per request | <5 | 5-15 | >15 |
| Single query time | <50ms | 50-200ms | >200ms |
| Connection pool usage | <50% | 50-80% | >80% |
| Table size (rows) | <1M | 1M-10M | >10M |
| Index coverage | >90% | 70-90% | <70% |

## Limitations

- Cannot measure real query performance without production data
- RLS policies require testing with actual Supabase auth context
- Migration safety depends on deployment strategy
