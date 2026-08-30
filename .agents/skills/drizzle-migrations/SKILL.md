---
name: drizzle-migrations
description: "Expert in Drizzle ORM migration workflow, RLS policies, schema evolution, and database management in SCAUDIT. Use when creating, modifying, or troubleshooting migrations."
risk: critical
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - drizzle
  - migrations
  - rls
  - postgresql
  - schema
  - database
  - supabase
---

# Drizzle Migrations Expert

Expert in the Drizzle ORM migration workflow, Row-Level Security policies, and schema evolution for SCAUDIT's PostgreSQL database via Supabase.

## When to Use This Skill

- When creating new database tables or modifying schemas
- When generating or applying Drizzle migrations
- When writing or modifying RLS policies
- When troubleshooting migration conflicts
- When performing schema evolution or data migrations
- When setting up RLS for new tenant-scoped tables

## Migration Workflow

### Step-by-Step

```
1. Modify schema in src/shared/db/schemas/*.ts
2. npx drizzle-kit generate     → Creates migration SQL in drizzle/
3. Review the generated SQL     → Validate correctness
4. npx drizzle-kit check        → Verify journal consistency
5. npx drizzle-kit push         → Apply to database (dev only!)
6. Verify with pg_policies     → Ensure RLS is correct
```

### Commands

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Push schema directly (development only)
npx drizzle-kit push

# Check migration journal consistency
npx drizzle-kit check

# Open Drizzle Studio (GUI)
npx drizzle-kit studio

# Pull existing database schema
npx drizzle-kit pull
```

### Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/db/schemas/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  },
});
```

## RLS Policy Patterns

### SCAUDIT RLS Pattern: `member_or_owner`

All tenant-scoped tables use this pattern:

```sql
-- SELECT policy: members can read, owners can read
CREATE POLICY "select_member_or_owner" ON table_name
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = (SELECT auth.uid())
      UNION
      SELECT id FROM projects
      WHERE owner_id = (SELECT auth.uid())
    )
  );

-- INSERT policy: only owners can insert (via server with withRLS)
CREATE POLICY "insert_owner_only" ON table_name
  FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE owner_id = (SELECT auth.uid())
    )
  );

-- UPDATE policy: owners can update
CREATE POLICY "update_owner_only" ON table_name
  FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE owner_id = (SELECT auth.uid())
    )
  );
```

### Server-Side with `withRLS()`

When the server writes on behalf of a user:

```typescript
import { withRLS } from "@/shared/db/rls";

// Wraps the query with RLS context
const result = await withRLS(userId, async (db) => {
  return db.insert(intelligenceFindings).values({
    projectId,
    severity: "high",
    title: "Finding",
  });
});
```

### Direct Server Writes (bypass RLS)

For admin operations or cron jobs:

```typescript
// Direct DB access without RLS (admin context)
const findings = await db.select()
  .from(intelligenceFindings)
  .where(eq(intelligenceFindings.projectId, projectId));
```

## Schema Evolution Patterns

### Adding a New Column

```typescript
// In schema file
export const projects = pgTable("projects", {
  // ... existing columns
  newColumn: text("new_column").default("default_value"),
});
```

### Adding a New Table

```typescript
// 1. Create schema
export const newTable = pgTable("new_table", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  // ... columns
}, (t) => [
  index("idx_new_table_project").on(t.projectId),
]);

// 2. Export from schemas/index.ts
export * from "./new-table";

// 3. Generate migration
// npx drizzle-kit generate

// 4. Add RLS policies
// 5. Add to schema barrel export
```

### Data Migration

```sql
-- In migration SQL file
UPDATE table_name
SET new_column = CASE
  WHEN old_column = 'value1' THEN 'new_value1'
  WHEN old_column = 'value2' THEN 'new_value2'
  ELSE 'default'
END
WHERE new_column IS NULL;
```

## Migration Conflict Resolution

When migration conflicts occur (common in team environments):

```bash
# 1. Check journal consistency
npx drizzle-kit check

# 2. If conflicts exist, resolve manually:
#    - Read the conflicting migration files
#    - Merge the changes into a single migration
#    - Update the journal.json

# 3. Regenerate if needed
npx drizzle-kit generate --custom
```

## Index Strategy

Always add indexes for:
- Foreign keys (automatic in Drizzle, but verify)
- Frequently queried columns (project_id, status, created_at)
- Composite indexes for common query patterns
- Unique constraints for business keys

```typescript
export const findings = pgTable("findings", {
  // ... columns
}, (t) => [
  index("idx_findings_project_severity").on(t.projectId, t.severity),
  index("idx_findings_created").on(t.createdAt),
]);
```

## Sharp Edges

### `drizzle-kit push` in production
**Problem:** `push` can cause data loss in production.
**Fix:** NEVER use `push` in production. Always use `generate` + `migrate` for production deployments.

### RLS policy missing on new table
**Problem:** New table is accessible to all users without RLS.
**Fix:** Always add RLS policies before granting table access. Verify with `pg_policies`.

### Journal inconsistency
**Problem:** Migration journal doesn't match applied migrations.
**Fix:** Run `drizzle-kit check` before every migration. Fix inconsistencies manually.

### Column type mismatch
**Problem:** Drizzle schema type doesn't match the database column type.
**Fix:** Use `drizzle-kit pull` to sync schema from the actual database.

## Validation Checklist

Before applying migrations:

- [ ] `drizzle-kit check` passes
- [ ] Generated SQL is reviewed and correct
- [ ] RLS policies are included for new tables
- [ ] Indexes are added for foreign keys and common queries
- [ ] Data migrations handle NULL values
- [ ] Backward compatibility is maintained
- [ ] Schema is exported from the barrel file
- [ ] Tests pass with the new schema

## Related Skills
- `drizzle-orm-expert` (ORM patterns and queries)
- `supabase` (Supabase-specific patterns)
- `postgres-best-practices` (PostgreSQL optimization)

## When to Use
- User mentions migrations, schema changes, or database evolution
- User mentions RLS policies, row-level security, or tenant isolation
- User needs to create new tables or modify existing ones
- User has migration conflicts or journal inconsistencies

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
