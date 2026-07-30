/**
 * plugins.ts — Plugin Marketplace Schema (P3.4)
 *
 * Almacena el catálogo de plugins disponibles (plugin_packages) y las
 * instalaciones por proyecto/usuario (plugin_instances).
 */

import {
  pgTable, uuid, text, timestamp, integer,
  jsonb, boolean, numeric, index
} from "drizzle-orm/pg-core";
import { projects, users } from "./index";

// ─── Catálogo de Plugins ────────────────────────────────────────────────────

export const pluginPackages = pgTable("plugin_packages", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  version: text("version").notNull(),
  author: text("author").notNull(),
  description: text("description").notNull(),
  longDescription: text("long_description"),
  iconUrl: text("icon_url"),
  category: text("category").notNull(),
  tags: text("tags").array(),
  homepage: text("homepage"),
  license: text("license").default("MIT"),
  minAppVersion: text("min_app_version").default("1.0.0"),
  dependencies: jsonb("dependencies").$type<Record<string, string>>().default({}),
  inputSchema: jsonb("input_schema").$type<Record<string, unknown>>().default({}),
  outputSchema: jsonb("output_schema").$type<Record<string, unknown>>().default({}),
  permissions: text("permissions").array(),
  riskLevel: text("risk_level").notNull().default("passive"),
  downloadsCount: integer("downloads_count").notNull().default(0),
  rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
  isOfficial: boolean("is_official").notNull().default(false),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_plugin_packages_category").on(t.category),
  index("idx_plugin_packages_name").on(t.name),
]);

// ─── Instancias de Plugins por Proyecto/Usuario ─────────────────────────────

export const pluginInstances = pgTable("plugin_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  packageId: uuid("package_id").references(() => pluginPackages.id, { onDelete: "cascade" }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_plugin_instances_user").on(t.userId),
  index("idx_plugin_instances_package_project").on(t.packageId, t.projectId),
]);

// ─── Tipos exportados ──────────────────────────────────────────────────────

export type PluginPackage = typeof pluginPackages.$inferSelect;
export type PluginPackageInsert = typeof pluginPackages.$inferInsert;
export type PluginInstance = typeof pluginInstances.$inferSelect;
export type PluginInstanceInsert = typeof pluginInstances.$inferInsert;
