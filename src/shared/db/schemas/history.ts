/**
 * history.ts — Historical DNS/WHOIS Tracking Schema (P0.2)
 *
 * Almacena snapshots hist￳ricos de resoluciones DNS y consultas WHOIS
 * para permitir timeline comparativo, drift de infraestructura,
 * tracking de cambios de registrar/expiraci￳n/nameservers, y forense.
 *
 * Integraci￳n: los executors de DNS y WHOIS escriben aqu￭ autom￡ticamente.
 * El orchestrator de discovery tambi￩n registra snapshots hist￳ricos.
 */

import {
  pgTable, uuid, text, timestamp, integer,
  jsonb, index
} from "drizzle-orm/pg-core";
import { projects } from "./index";
import { intelligenceInvestigations } from "./intelligence";

// ─── DNS History ─────────────────────────────────────────────────────────────
// Cada fila = un registro DNS hist￳rico (A, AAAA, MX, TXT, NS, etc.)
// snapshot_hash permite detectar cambios entre snapshots consecutivos

export const dnsHistory = pgTable("dns_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  investigationId: uuid("investigation_id").references(() => intelligenceInvestigations.id, { onDelete: "cascade" }),
  recordType: text("record_type").notNull(),
  query: text("query").notNull(),
  value: text("value").notNull(),
  ttl: integer("ttl"),
  snapshotHash: text("snapshot_hash").notNull(),
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).defaultNow().notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_dns_history_project_record_type").on(t.projectId, t.recordType),
  index("idx_dns_history_query_created").on(t.query, t.createdAt),
  index("idx_dns_history_snapshot_date").on(t.snapshotDate),
]);

// ─── WHOIS History ───────────────────────────────────────────────────────────
// Cada fila = un snapshot WHOIS completo de un dominio
// diff_summary contiene el resumen de cambios vs el snapshot anterior

export const whoisHistory = pgTable("whois_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  investigationId: uuid("investigation_id").references(() => intelligenceInvestigations.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  registrar: text("registrar"),
  createdDate: timestamp("created_date", { withTimezone: true }),
  expiresDate: timestamp("expires_date", { withTimezone: true }),
  updatedDate: timestamp("updated_date", { withTimezone: true }),
  status: jsonb("status").$type<string[]>().default([]),
  nameservers: jsonb("nameservers").$type<string[]>().default([]),
  abuseContact: text("abuse_contact"),
  registrantOrg: text("registrant_org"),
  snapshotHash: text("snapshot_hash").notNull(),
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).defaultNow().notNull(),
  diffSummary: text("diff_summary"),
  originalSnapshot: jsonb("original_snapshot").$type<Record<string, unknown>>().default({}),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_whois_history_project_domain").on(t.projectId, t.domain),
  index("idx_whois_history_domain_snapshot").on(t.domain, t.snapshotDate),
  index("idx_whois_history_expires_date").on(t.expiresDate),
]);
