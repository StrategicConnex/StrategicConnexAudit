import {
  pgTable, uuid, text, boolean, integer, timestamp, index, uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./index";

/**
 * exec-briefs.ts — Resúmenes ejecutivos IA por proyecto (Sprint 3, idea #2).
 *
 * 1 fila VIVA por proyecto (replaced_at IS NULL): la última que muestra el
 * portal. Al generar una nueva, la anterior se cierra con replaced_at → queda
 * historial sin consultas adicionales. El índice único parcial garantiza la
 * unicidad a nivel BD (defensa si dos runs compiten).
 */
export const execBriefs = pgTable(
  "exec_briefs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Texto en markdown ligero listo para el portal (headline + summary + listas). */
    content: text("content").notNull(),
    isFallback: boolean("is_fallback").notNull().default(false),
    modelUsed: text("model_used"),
    promptVersion: integer("prompt_version").notNull().default(1),
    /** Auditoría que originó el brief (si aplica). */
    auditId: uuid("audit_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** NULL = fila viva (la actual). Fecha = reemplazada por una más nueva. */
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
  },
  (t) => [
    // Unicidad de la fila viva, igual que uq_forecasts_project_metric (0031).
    uniqueIndex("uq_exec_briefs_project_live")
      .on(t.projectId)
      .where(sql`replaced_at IS NULL`),
    index("idx_exec_briefs_project_created").on(t.projectId, t.createdAt),
  ]
);

// ─── Helpers de acceso ───────────────────────────────────────────────────────

import { and, eq, isNull } from "drizzle-orm";
import { directDb } from "@/shared/db";

/** Fila viva del proyecto o null. */
export async function findLatestBrief(projectId: string) {
  const [row] = await directDb
    .select()
    .from(execBriefs)
    .where(and(eq(execBriefs.projectId, projectId), isNull(execBriefs.replacedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Persiste un brief: cierra la fila viva previa (replaced_at=now) e inserta
 * la nueva. Idempotente ante carreras: si el índice único parcial rechaza la
 * inserción (otra fila viva ganó la carrera), se re-intenta cerrando de nuevo
 * y devolviendo la ganadora. Devuelve la fila viva resultante.
 */
export async function upsertExecBrief(input: {
  projectId: string;
  content: string;
  isFallback: boolean;
  modelUsed: string | null;
  promptVersion: number;
  auditId: string | null;
}) {
  const now = new Date();

  // 1. Cerrar la fila viva previa (si la hay).
  await directDb
    .update(execBriefs)
    .set({ replacedAt: now })
    .where(and(eq(execBriefs.projectId, input.projectId), isNull(execBriefs.replacedAt)));

  // 2. Insertar la nueva.
  const [row] = await directDb
    .insert(execBriefs)
    .values({
      projectId: input.projectId,
      content: input.content,
      isFallback: input.isFallback,
      modelUsed: input.modelUsed,
      promptVersion: input.promptVersion,
      auditId: input.auditId,
    })
    .returning();

  return [row];
}
