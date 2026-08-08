import { schedules, tasks } from "@trigger.dev/sdk";
import { directDb } from "@/shared/db";
import { audits, monitoringSchedules } from "@/shared/db/schemas";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { runProjectAudit } from "./audit.trigger";

/**
 * Scheduled Intelligence Scanning — Trigger.dev task.
 *
 * Cada hora evalúa los `monitoring_schedules` habilitados cuyo `nextRunAt` ya
 * venció y dispara una auditoría de inteligencia para cada proyecto, encolando
 * el job `run-project-audit` (misma ruta que la auditoría manual vía UI).
 *
 * Idempotencia: solo se procesan schedules con `nextRunAt <= now`; el `nextRunAt`
 * se reserva (adelanta) ANTES de crear el audit para que un fallo de encolado
 * no reprocese el mismo schedule en el ciclo siguiente.
 */
const INTERVAL_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export const scheduledScanTask = schedules.task({
  id: "scheduled-scan-runner",
  cron: "0 * * * *", // Cada hora
  run: async (payload) => {
    // Usar el timestamp del ciclo (determinista y auditable) como base temporal
    const now = new Date(payload.timestamp ?? new Date());
    console.log(`[ScheduledScan] Ciclo ${now.toISOString()}`);

    // 1. Schedules habilitados y vencidos (nextRunAt not null y <= now)
    const dueSchedules = await directDb
      .select()
      .from(monitoringSchedules)
      .where(
        and(
          eq(monitoringSchedules.enabled, true),
          isNotNull(monitoringSchedules.nextRunAt),
          lte(monitoringSchedules.nextRunAt, now)
        )
      );

    console.log(`[ScheduledScan] ${dueSchedules.length} schedule(s) vencido(s).`);

    const processed: Array<{ scheduleId: string; projectId: string; auditId: string }> = [];
    const errors: Array<{ scheduleId: string; error: string }> = [];

    for (const schedule of dueSchedules) {
      const intervalMs = INTERVAL_MS[schedule.interval] ?? INTERVAL_MS.weekly;
      const nextRunAt = new Date(now.getTime() + intervalMs);

      try {
        // 2. Reservar el próximo run ANTES de crear el audit (idempotencia:
        //    si falla el encolado, el schedule ya no está vencido).
        await directDb
          .update(monitoringSchedules)
          .set({ lastRunAt: now, nextRunAt, updatedAt: now })
          .where(eq(monitoringSchedules.id, schedule.id));

        // 3. Crear la auditoría (pending) — sin createdBy (ejecución de sistema)
        const [audit] = await directDb
          .insert(audits)
          .values({
            projectId: schedule.projectId,
            type: "full",
            status: "pending",
            startedAt: now,
          })
          .returning();

        if (!audit) {
          throw new Error("No se pudo crear el registro de auditoría");
        }

        // 4. Encolar el job de auditoría (mismo task que la UI)
        await tasks.trigger<typeof runProjectAudit>("run-project-audit", {
          projectId: schedule.projectId,
          auditId: audit.id,
        });

        processed.push({ scheduleId: schedule.id, projectId: schedule.projectId, auditId: audit.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[ScheduledScan] Fallo schedule ${schedule.id}: ${message}`);
        errors.push({ scheduleId: schedule.id, error: message });
      }
    }

    return {
      success: true,
      processedSchedules: processed.length,
      enqueuedAudits: processed,
      errors,
      timestamp: new Date().toISOString(),
    };
  },
});
