---
name: rbac-authorization
description: "Expert in SCAUDIT's RBAC authorization system: roles, permissions, team management, and access control. Use when building or modifying authorization, roles, or team features."
risk: critical
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - rbac
  - authorization
  - permissions
  - teams
  - roles
  - access-control
  - multi-tenant
---

# RBAC & Authorization Expert

Expert in SCAUDIT's role-based access control system. Covers roles, permissions, team management, project membership, and multi-tenant access control.

## When to Use This Skill

- When working with RBAC logic (`src/server/auth/rbac.ts`)
- When building or modifying team features (`src/shared/db/schemas/teams.ts`)
- When modifying project members API (`src/app/api/projects/[id]/members/`)
- When building the Settings/Team tab
- When implementing permission checks in API routes
- When modifying admin actions (`src/app/admin/actions.ts`)

## Role Hierarchy

```
admin (Full system access)
  └─ Can manage all projects, users, and system settings
  └─ Can access admin dashboard
  └─ Can bypass RLS for administrative tasks

manager (Project-level management)
  └─ Can manage project settings
  └─ Can invite/remove team members
  └─ Can run audits and scans
  └─ Can manage integrations

client (Read-only + limited actions)
  └─ Can view project data
  └─ Can run pre-approved scans
  └─ Cannot manage team or settings
  └─ Cannot access admin features
```

## Permission Model

### Role Definitions

```typescript
// src/server/auth/rbac.ts
export const permissions = {
  admin: [
    "projects:create", "projects:read", "projects:update", "projects:delete",
    "users:read", "users:update", "users:delete",
    "teams:manage",
    "audits:manage",
    "integrations:manage",
    "settings:manage",
    "admin:access",
  ],
  manager: [
    "projects:read", "projects:update",
    "teams:invite", "teams:remove",
    "audits:create", "audits:read",
    "integrations:manage",
    "reports:create", "reports:read",
  ],
  client: [
    "projects:read",
    "audits:read",
    "reports:read",
  ],
};
```

### Permission Check Pattern

```typescript
import { requirePermission } from "@/server/auth/rbac";

export async function POST(request: Request) {
  const user = await requireAuth();
  
  // Check project-level permission
  await requirePermission(user.id, projectId, "audits:create");
  
  // Proceed with operation
}
```

## Team Management

### Project Membership

```typescript
// schemas/teams.ts
export const projectMembers = pgTable("project_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull().default("client"),  // "manager" | "client"
  invitedBy: uuid("invited_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.userId),
]);
```

### Invitation Flow

```
1. Manager invites user by email
2. Invitation stored in pending_invitations
3. User accepts invitation
4. Project membership created
5. User gains access to project
```

### Access Check

```typescript
async function isProjectMember(userId: string, projectId: string): Promise<boolean> {
  const membership = await db.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.userId, userId),
      eq(projectMembers.projectId, projectId),
    ),
  });
  
  // Also check if user is the project owner
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  
  return membership !== undefined || project?.ownerId === userId;
}
```

## Multi-Tenant Isolation

### RLS Integration

RBAC works alongside RLS:
- **RLS** ensures data isolation at the database level
- **RBAC** controls what actions users can perform

### Owner vs Member

| Action | Owner | Manager | Client |
|--------|-------|---------|--------|
| View project | ✅ | ✅ | ✅ |
| Edit settings | ✅ | ✅ | ❌ |
| Manage team | ✅ | ✅ | ❌ |
| Run audits | ✅ | ✅ | ❌ |
| Delete project | ✅ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ |

## Admin Dashboard

The admin dashboard (`src/app/admin/`) provides:
- User management (list, update roles, deactivate)
- Project oversight (all projects across all users)
- System health monitoring
- Audit log viewer

### Admin Actions

```typescript
// src/app/admin/actions.ts
export async function updateUserRole(userId: string, newRole: "admin" | "manager" | "client") {
  const admin = await requireAdmin();
  await db.update(users)
    .set({ role: newRole })
    .where(eq(users.id, userId));
  // Log the action
  await logAuditAction(admin.id, "update_user_role", { userId, newRole });
}
```

## Sharp Edges

### IDOR via project membership
**Problem:** User A accesses User B's project by guessing the project ID.
**Fix:** Always check project membership before returning data. Use RLS as defense-in-depth.

### Role escalation
**Problem:** Manager invites themselves as admin.
**Fix:** Only owners can change roles. Only admins can promote to admin.

### Stale permissions
**Problem:** User's role changes but cached permissions are outdated.
**Fix:** Invalidate permission cache on role change. Re-check on sensitive operations.

### Owner deletion
**Problem:** Project owner is deleted, leaving orphaned projects.
**Fix:** Transfer ownership before deletion, or assign a default admin as owner.

## Validation Checklist

Before modifying authorization code:

- [ ] Permission checks are enforced at the API level
- [ ] RLS policies align with RBAC roles
- [ ] Project membership is verified before data access
- [ ] Admin actions are logged in audit trail
- [ ] Role changes require appropriate authorization
- [ ] Tests cover all role combinations
- [ ] Edge cases (owner deletion, role change) are handled

## Related Skills
- `supabase` (auth and RLS patterns)
- `drizzle-migrations` (schema patterns)
- `nextjs-best-practices` (middleware patterns)

## When to Use
- User mentions RBAC, roles, permissions, or authorization
- User mentions team management, invitations, or project membership
- User mentions admin dashboard or user management
- User asks about multi-tenant access control

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
