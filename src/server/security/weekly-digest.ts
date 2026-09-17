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
import { projects, uptimeLogs, issues, anomalyDetections, users } from "@/shared/db/schemas";
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
  emailSent: boolean;
  telegramSent: boolean;
}

/**
 * B-5: entrega directa al dueño por email (Resend) + Telegram del proyecto.
 * Independientes de los canales SIEM: aunque no haya ninguno configurado,
 * el dueño con email recibe su resumen.
 */
async function deliverDirect(
  ownerEmail: string | null,
  telegramChatId: string | null,
  domain: string,
  uptimePct: number | null,
  criticalIssues: number,
  anomalies: number
): Promise<{ emailSent: boolean; telegramSent: boolean }> {
  let emailSent = false;
  let telegramSent = false;

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.SIEM_EMAIL_FROM;
  if (ownerEmail && resendKey && from) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [ownerEmail],
          subject: `Resumen semanal: ${domain} — uptime ${uptimePct ?? "—"}, ${criticalIssues} críticas`,
          html: `<h2>Resumen semanal: ${domain}</h2><ul><li>Uptime 7d: ${uptimePct ?? "sin datos"}</li><li>Issues críticas: ${criticalIssues}</li><li>Anomalías 7d: ${anomalies}</li></ul>`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      emailSent = res.ok;
    } catch {
      emailSent = false;
    }
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (telegramChatId && botToken) {
    try {
      const text = `Resumen semanal ${domain}\nUptime 7d: ${uptimePct ?? "sin datos"}\nCríticas: ${criticalIssues}\nAnomalías: ${anomalies}`;
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChatId, text }),
        signal: AbortSignal.timeout(10_000),
      });
      telegramSent = res.ok;
    } catch {
      telegramSent = false;
    }
  }

  return { emailSent, telegramSent };
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
    logger.info("[WeeklyDigest] Sin canales SIEM: solo entrega directa (email/Telegram).");
  }

  const activeProjects = await directDb
    .select({
      id: projects.id,
      domain: projects.domain,
      ownerEmail: users.email,
      settings: projects.settings,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerId))
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
      // B-5: entrega directa aunque no haya canales SIEM.
      const settings = (project.settings ?? {}) as { telegramChatId?: string };
      const direct = await deliverDirect(
        project.ownerEmail ?? null,
        settings.telegramChatId ?? null,
        project.domain,
        uptimePct,
        criticalIssues,
        anomalies
      );
      results.push({
        projectId: project.id,
        domain: project.domain,
        uptimePct,
        criticalIssues,
        anomalies7d: anomalies,
        sent: ok,
        emailSent: direct.emailSent,
        telegramSent: direct.telegramSent,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[WeeklyDigest] Error en ${project.domain}:`, msg);
      errors.push(`${project.domain}: ${msg}`);
      failed++;
    }
  }

  return { projects: activeProjects.length, sent, failed, errors, results };
}
