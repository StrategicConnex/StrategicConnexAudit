import { pgTable, pgEnum, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { users, projects } from "./index";

// Kept for backward compatibility of any remaining legacy code that imports these
// names. Do not add new product code that depends on these tables.
export const projectRoleEnum = pgEnum("project_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
  "guest",
]);

/**
 * Legacy marker removed with project_members in migration 0052.
 * The product is owner-only (ADR-0XX); there is no active project_members
 * table and no typed schema for it.
 */
export const projectMembers = undefined as unknown; // legacy-only, never queried

// Retained only while legacy/backup code references it. Not an active feature.
export const projectInvitations = pgTable("project_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  email: text("email").notNull(),
  role: projectRoleEnum("role").default("viewer").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_project_invitations_invited_by").on(t.invitedBy),
]);

// Retained only while legacy/backup code references it. Not an active feature.
export const teamAuditLogs = pgTable("team_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetEmail: text("target_email"),
  role: projectRoleEnum("role"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_team_audit_logs_project").on(t.projectId),
  index("idx_team_audit_logs_actor").on(t.actorId),
]);
