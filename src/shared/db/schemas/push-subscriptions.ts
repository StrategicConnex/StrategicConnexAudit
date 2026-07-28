/**
 * push-subscriptions.ts — Browser Push Notification Subscriptions
 *
 * Almacena suscripciones Push API de los navegadores de los usuarios
 * para poder enviarles notificaciones cuando el SIEM detecte eventos
 * crticos (ai_model_health, etc.).
 *
 * Cada fila representa un navegador/device que se suscribi.
 * Los usuarios pueden tener mltiples suscripciones (una por dispositivo).
 */

import {
  pgTable, uuid, text, timestamp, jsonb, index
} from "drizzle-orm/pg-core";
import { users } from "./index";

/**
 * Suscripcin Push de un navegador.
 * subscription es el objeto PushSubscription JSON completo que enva el browser.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),

  /** Usuario propietario de esta suscripcin (nullable si no autenticado) */
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),

  /** Endpoint nico que entrega el navegador (URL del push service) */
  endpoint: text("endpoint").notNull().unique(),

  /** Objeto PushSubscription completo (endpoint + keys) como JSON */
  subscription: jsonb("subscription").$type<Record<string, unknown>>().notNull(),

  /** User-Agent del navegador que se suscribi */
  userAgent: text("user_agent"),

  /** Activo: desactivamos en lugar de borrar para evitar re-suscripciones masivas */
  active: text("active").notNull().default("true"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_push_subs_user").on(t.userId),
  index("idx_push_subs_active").on(t.active),
]);
