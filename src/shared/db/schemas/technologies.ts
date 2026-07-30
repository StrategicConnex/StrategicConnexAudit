import {
  pgTable, uuid, text, timestamp, jsonb, numeric
} from "drizzle-orm/pg-core";
import { projects } from "./index";

export const domainTechnologies = pgTable("domain_technologies", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  domain: text("domain").notNull(),
  techName: text("tech_name").notNull(),
  category: text("category").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0.900"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
});
