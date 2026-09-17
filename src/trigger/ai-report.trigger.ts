import { task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { aiReportJobs } from "@/shared/db/schemas";
import { generateSeoReport } from "@/server/ai/seo-report-service";
import { logger } from "@/lib/logger";

export interface AiSeoReportPayload {
  jobId: string;
}

/**
 * Generación diferida del informe SEO (P2-1).
 *
 * Vive en Trigger.dev (hasta 10 min) en vez de bloquear 120s de función
 * Vercel. Lee el job (projectId/userId), genera con el servicio compartido
 * y persiste el resultado. Reintentos x3 con backoff.
 */
export const runAiSeoReport = task({
  id: "ai-seo-report-generation",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: AiSeoReportPayload) => {
    const [job] = await directDb
      .select()
      .from(aiReportJobs)
      .where(eq(aiReportJobs.id, payload.jobId))
      .limit(1);

    if (!job) {
      throw new Error(`ai_report_jobs inexistente: ${payload.jobId}`);
    }

    await directDb
      .update(aiReportJobs)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(aiReportJobs.id, job.id));

    try {
      const result = await generateSeoReport(job.projectId, job.userId ?? "system");

      if (!result.ok) {
        await directDb
          .update(aiReportJobs)
          .set({ status: "failed", error: result.error, updatedAt: new Date() })
          .where(eq(aiReportJobs.id, job.id));
        return { ok: false, error: result.error };
      }

      await directDb
        .update(aiReportJobs)
        .set({
          status: "completed",
          report: result.report,
          isFallback: result.isFallback,
          modelUsed: result.modelUsed ?? null,
          updatedAt: new Date(),
        })
        .where(eq(aiReportJobs.id, job.id));

      return { ok: true, jobId: job.id, isFallback: result.isFallback };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("ai-seo-report-generation falló", { error: message });
      await directDb
        .update(aiReportJobs)
        .set({ status: "failed", error: message.slice(0, 500), updatedAt: new Date() })
        .where(eq(aiReportJobs.id, job.id));
      throw error;
    }
  },
});
