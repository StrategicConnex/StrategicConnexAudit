import { schedules } from "@trigger.dev/sdk";
import { listOverdueFindings } from "@/server/intelligence/findings/workflow";
import {
  notifyProjectAdmins,
  listRecentlyEscalatedFindingIds,
} from "@/server/notifications/emit";

/**
 * finding-sla.trigger.ts — Escalado por SLA (Tanda 2 / B1 + B6).
 *
 * Barrido diario: los hallazgos con `due_at` vencido y estado abierto se
 * escalan avisando a los gestores del proyecto (owner + admins) por la bandeja.
 *
 * Idempotencia: no se vuelve a avisar del MISMO hallazgo dentro de 24h. Sin
 * esto, un hallazgo vencido y sin resolver generaría una notificación diaria
 * idéntica — ruido que entrena al usuario a ignorar la campana, justo lo
 * contrario de lo que busca el SLA.
 *
 * Los hallazgos suprimidos (B6) quedan fuera en la propia query de
 * listOverdueFindings: silenciar es una decisión explícita del analista.
 */

export const SLA_ESCALATION_LIMIT = 200;
export const SLA_ESCALATION_DEDUP_HOURS = 24;

export const findingSlaSweep = schedules.task({
  id: "finding-sla-sweep",
  cron: "0 5 * * *",
  retry: { maxAttempts: 2 },
  run: async (payload) => {
    console.log(`[FindingSla] Inicio ${payload.timestamp.toISOString()}`);

    const overdue = await listOverdueFindings(SLA_ESCALATION_LIMIT);
    const alreadyEscalated = await listRecentlyEscalatedFindingIds(
      "finding_overdue",
      SLA_ESCALATION_DEDUP_HOURS,
    );

    let escalated = 0;
    let notifications = 0;
    const perProject: Record<string, number> = {};

    for (const finding of overdue) {
      if (alreadyEscalated.has(finding.id)) continue;

      const sent = await notifyProjectAdmins({
        projectId: finding.projectId,
        kind: "finding_overdue",
        title: `SLA vencido: ${finding.title}`.slice(0, 200),
        body:
          `El hallazgo "${finding.title}" (${finding.severity}) venció su SLA` +
          (finding.dueAt ? ` el ${finding.dueAt.toISOString().slice(0, 10)}` : "") +
          ". Revísalo y resuélvelo, ciérralo como aceptado o silenciarlo si es ruido.",
        link: `/dashboard?tab=triage&project=${finding.projectId}&finding=${finding.id}`,
        metadata: {
          findingId: finding.id,
          severity: finding.severity,
          dueAt: finding.dueAt?.toISOString() ?? null,
        },
      });

      escalated++;
      notifications += sent;
      perProject[finding.projectId] = (perProject[finding.projectId] ?? 0) + 1;
    }

    console.log(
      `[FindingSla] Fin: vencidos=${overdue.length} escalados=${escalated} notificaciones=${notifications}`,
    );

    return {
      success: true,
      overdue: overdue.length,
      escalated,
      notifications,
      perProject,
      timestamp: payload.timestamp.toISOString(),
    };
  },
});
