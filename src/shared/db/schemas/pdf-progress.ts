/**
 * pdf-progress.ts — Progreso de generación de PDFs
 *
 * Sustituye las claves Redis `pdf_progress:<userId>:<genId>` que usaba el
 * SSE de progreso (VULN-007) tras la eliminación de Upstash (etapa 2).
 *
 * Una fila por (usuario, generación). El backend escribe con `directDb`
 * (conexión de servicio, bypassa RLS) tras autenticar al usuario; el SSE
 * consulta la fila por clave primaria compuesta, así que un tercero jamás
 * puede observar la generación de otro usuario aunque las policies RLS
 * no estuvieran en el camino.
 *
 * Limpieza: las rutas borran la fila al terminar (complete/error) y un
 * sweep periódico descarta filas con `updated_at` anterior a 24h (crashes).
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const pdfProgress = pgTable(
  "pdf_progress",
  {
    /** Usuario que inició la generación (parte de la clave de tenant). */
    userId: uuid("user_id").notNull(),

    /** Generation-Id devuelto por POST /api/reports/pdf (X-Generation-Id). */
    genId: text("gen_id").notNull(),

    /** Progreso 0-100. */
    percent: integer("percent").notNull().default(0),

    /** Etapa legible para el frontend (ej. "Renderizando páginas del PDF..."). */
    step: text("step"),

    /** "working" | "complete" | "error". */
    status: text("status").notNull().default("working"),

    /** Mensaje de fallo cuando status = "error". */
    error: text("error"),

    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.genId] }),
    index("idx_pdf_progress_updated_at").on(t.updatedAt),
  ],
);
