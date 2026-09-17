/**
 * weekly-digest.ts — Resumen semanal ejecutivo por proyecto (P2-5).
 *
 * Cada lunes: uptime 7d + issues críticas abiertas + anomalías 7d, enviado
 * como SiemPattern por los canales SIEM configurados (Slack/Email/…).
 * Reusa WEBHOOK_FORMATTERS + persistDelivery como api-key-expiry-alert.
 * Sin canales configurados no hace nada (graceful, sin errores).
 */

import { and, count, eq, gte, isNull } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { projects, uptimeLogs, issues, anomalyDetections } from "@/shared/db/schemas";
import {
  WEBHOOK_FORMATTERS,
  persistDelivery,
  type SiemPattern,
} from "@/server/security/siem-exporter";
import { logger } from "@/lib/logger";

export interface DigestProjectResult {
  projectId: string;
  domain: string;
  uptimePct: number | null;
  criticalIssues: number;
  anomalies7d: number;
  sent: boolean;
}

/** Severidad del digest: crítica si uptime <95% o hay issues críticas. Pura → testeable. */
export function digestSeverity(
  uptimePct: number | null,
  criticalIssues: number
): "critical" | "info" {
  if (criticalIssues > 0) return "critical";
  if (uptimePct !== null && uptimePct < 95) return "critical";
  return "info";
}

async function buildPattern(
  projectId: string,
  domain: string
): Promise<{ pattern: SiemPattern; uptimePct: number | null; criticalIssues: number; anomalies: number }> {
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [up] = await directDb
    .select({ total: count() })
    .from(uptimeLogs)
    .where(and(eq(uptimeLogs.projectId, projectId), gte(uptimeLogs.checkedAt, weekAgo)));

  // Conteo de OK por separado (count(col) cuenta no-nulos, no trues).
  const [up2] = await directDb
    .select({ ups: count() })
    .from(uptimeLogs)
    .where(
      and(
        eq(uptimeLogs.projectId, projectId),
        gte(uptimeLogs.checkedAt, weekAgo),
        eq(uptimeLogs.isUp, true)
      )
    );

  const total = Number(up?.total ?? 0);
  const ups = Number(up2?.ups ?? 0);
  const uptimePct = total > 0 ? Math.round((ups / total) * 1000) / 10 : null;
  const [crit] = await directDb
    .select({ n: count() })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.severity, "critical")));
  const criticalIssues = Number(crit?.n ?? 0);

  const [anom] = await directDb
    .select({ n: count() })
    .from(anomalyDetections)
    .where(
      and(eq(anomalyDetections.projectId, projectId), gte(anomalyDetections.detectedAt, weekAgo))
    );
  const anomalies = Number(anom?.n ?? 0);

  const severity = digestSeverity(uptimePct, criticalIssues);
  const now = new Date();
  const pattern: SiemPattern = {
    eventType: "weekly_digest",
    ip: "n/a",
    count: total,
    windowMinutes: 7 * 24 * 60,
    severity,
    label: `Resumen semanal: ${domain}`,
    firstSeen: weekAgo,
    lastSeen: now,
    paths: [domain],
    methods: [],
    metadataSamples: [
      { domain, uptimePct, criticalIssues, anomalies7d: anomalies },
    ],
  };
  return { pattern, uptimePct, criticalIssues, anomalies };
}

export async function runWeeklyDigest(): Promise<{
  projects: number;
  sent: number;
  failed: number;
  errors: string[];
  results: DigestProjectResult[];
}> {
  const errors: string[] = [];
  const results: DigestProjectResult[] = [];
  let sent = 0;
  let failed = 0;

  const targets = WEBHOOK_FORMATTERS.filter((w) => process.env[w.envVar]);
  if (targets.length === 0) {
    return { projects: 0, sent: 0, failed: 0, errors: ["Sin canales SIEM configurados"], results };
  }

  const activeProjects = await directDb
    .select({ id: projects.id, domain: projects.domain })
    .from(projects)
    .where(and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false)));

  for (const project of activeProjects) {
    try {
      const { pattern, uptimePct, criticalIssues, anomalies } = await buildPattern(
        project.id,
        project.domain
      );
      let ok = false;
      for (const target of targets) {
        try {
          const payload = target.formatter(pattern);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const res = await fetch(payload.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...payload.headers },
            body: JSON.stringify(payload.body),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.ok) {
            ok = true;
            await persistDelivery(pattern, target.name, "success", res.status, null);
          } else {
            await persistDelivery(pattern, target.name, "failed", res.status, null);
          }
        } catch (err) {
          await persistDelivery(
            pattern,
            target.name,
            "failed",
            null,
            err instanceof Error ? err.message.slice(0, 500) : String(err)
          );
        }
      }
      if (ok) sent++;
      else failed++;
      results.push({ projectId: project.id, domain: project.domain, uptimePct, criticalIssues, anomalies7d: anomalies, sent: ok });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[WeeklyDigest] Error en ${project.domain}:`, msg);
      errors.push(`${project.domain}: ${msg}`);
      failed++;
    }
  }

  return { projects: activeProjects.length, sent, failed, errors, results };
}
