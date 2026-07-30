import {
  pgTable, uuid, text, timestamp, pgEnum, unique
} from "drizzle-orm/pg-core";
import { users, projects } from "./index";

// 1. Roles Enum for Project RBAC
export const projectRoleEnum = pgEnum("project_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
  "guest"
]);

// 2. Project Members Table
export const projectMembers = pgTable("project_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: projectRoleEnum("role").default("viewer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.userId)
]);

// 3. Project Invitations Table
export const projectInvitations = pgTable("project_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  email: text("email").notNull(),
  role: projectRoleEnum("role").default("viewer").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.email)
]);

// 4. Team Audit Logs Table
export const teamAuditLogs = pgTable("team_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: 'set null' }),
  action: text("action").notNull(), // e.g., 'member_invited', 'role_changed', 'member_removed'
  targetEmail: text("target_email"),
  role: projectRoleEnum("role"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
