import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql, desc } from "drizzle-orm";
import { users, projects } from "./index";

/**
 * notifications — Bandeja por usuario (Tanda 2 / B3).
 * Paridad con drizzle/2026-10-05_notifications.sql.
 *
 * La RLS es estricta por `user_id`: un usuario nunca ve la bandeja de otro.
 * El servicio (directDb) es el único que inserta; el usuario solo lee y marca
 * como leída.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_notifications_user_created").on(t.userId, desc(t.createdAt)),
    // Índice parcial del badge: solo las no leídas.
    index("idx_notifications_user_unread")
      .on(t.userId, desc(t.createdAt))
      .where(sql`read_at IS NULL`),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
