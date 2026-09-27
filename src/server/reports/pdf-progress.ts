/**
 * pdf-progress.ts — Almacén del progreso de generación de PDFs.
 *
 * Sustituye a las claves Redis de Upstash (`pdf_progress:<userId>:<genId>`)
 * tras la eliminación de `@upstash/redis`/`@upstash/ratelimit`. El progreso
 * vive ahora en la tabla `pdf_progress` y el SSE lo consulta por clave
 * primaria compuesta, de modo que el aislamiento por usuario del fix
 * VULN-007 lo garantiza la propia PK en lugar de una convención de claves.
 *
 * Escritura: `directDb` (conexión de servicio, bypassa RLS) — las rutas ya
 * autenticaron al usuario. Lectura: misma conexión, por PK.
 *
 * Fail-safe por contrato: el progreso jamás puede romper la generación del
 * PDF ni el stream; cualquier error de I/O se degrada a "no progreso".
 */

import { and, eq, lt } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { pdfProgress } from "@/shared/db/schemas";
import { logger } from "@/lib/logger";

export type PdfProgressStatus = "working" | "complete" | "error";

export interface PdfProgressInput {
  percent: number;
  step?: string;
  status?: PdfProgressStatus;
  error?: string;
}

export interface PdfProgressRecord {
  percent: number;
  step?: string;
  status: PdfProgressStatus;
  error?: string;
  updatedAt: Date;
}

/** Filas huérfanas (generación muerta sin cerrar) más antiguas que esto. */
const STALE_MS = 24 * 60 * 60 * 1000;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toRecord(row: {
  percent: number;
  step: string | null;
  status: string;
  error: string | null;
  updatedAt: Date;
}): PdfProgressRecord {
  return {
    percent: row.percent,
    step: row.step ?? undefined,
    status: (row.status as PdfProgressStatus) || "working",
    error: row.error ?? undefined,
    updatedAt: row.updatedAt,
  };
}

function scope(userId: string, genId: string) {
  return and(eq(pdfProgress.userId, userId), eq(pdfProgress.genId, genId));
}

/** Inserta o actualiza la fila del (usuario, generación). Nunca lanza. */
export async function writePdfProgress(
  userId: string,
  genId: string,
  input: PdfProgressInput
): Promise<void> {
  const now = new Date();
  const values = {
    percent: clampPercent(input.percent),
    step: input.step ?? null,
    status: input.status ?? "working",
    error: input.error ?? null,
    updatedAt: now,
  };
  try {
    await directDb
      .insert(pdfProgress)
      .values({ userId, genId, ...values })
      .onConflictDoUpdate({
        target: [pdfProgress.userId, pdfProgress.genId],
        set: values,
      });
  } catch (error) {
    logger.warn("[pdf-progress] write failed:", error);
  }
}

/** Lee la fila del (usuario, generación). `null` si no existe o hay error. */
export async function readPdfProgress(
  userId: string,
  genId: string
): Promise<PdfProgressRecord | null> {
  try {
    const rows = await directDb
      .select()
      .from(pdfProgress)
      .where(scope(userId, genId))
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  } catch (error) {
    logger.warn("[pdf-progress] read failed:", error);
    return null;
  }
}

/** Elimina la fila del (usuario, generación). Nunca lanza. */
export async function deletePdfProgress(userId: string, genId: string): Promise<void> {
  try {
    await directDb.delete(pdfProgress).where(scope(userId, genId));
  } catch (error) {
    logger.warn("[pdf-progress] delete failed:", error);
  }
}

/**
 * Barre filas huérfanas: generaciones que murieron sin pasar por
 * `complete`/`error` (crash, deploy, pestaña cerrada). Se lanza una vez por
 * generación al arrancar el POST; nunca bloquea ni propaga errores.
 */
export async function pruneStalePdfProgress(maxAgeMs: number = STALE_MS): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - maxAgeMs);
    await directDb.delete(pdfProgress).where(lt(pdfProgress.updatedAt, cutoff));
  } catch (error) {
    logger.warn("[pdf-progress] prune failed:", error);
  }
}
