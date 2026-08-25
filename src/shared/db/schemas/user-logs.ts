import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./index";

/* ═══════════════════════════════════════════════════════════════════════
   43. User Logs — Telemetría de accesos (panel admin)

   Un fila por usuario (upsert por user_id): email, última conexión, IP y
   país detectados por el proxy de Next (x-forwarded-for / x-vercel-ip-country).
   Escritura SOLO vía conexión de servicio (directDb); lectura RLS-limitada
   al admin de plataforma (ver drizzle/2026-08-25_admin_telemetry.sql).
   ═══════════════════════════════════════════════════════════════════════ */

export const userLogs = pgTable(
  "user_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    lastLogin: timestamp("last_login", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    country: text("country"),
    userAgent: text("user_agent"),
    accessCount: integer("access_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_user_logs_last_login").on(t.lastLogin),
    index("idx_user_logs_email").on(t.email),
  ],
);
