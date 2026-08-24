'use server';

import { ActionState, authenticatedAction } from "@/shared/lib/actions";
import { z } from "zod";
import { audits, projects, crawlResults, issues } from "@/shared/db/schemas";
import { eq, and, gt } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk";
import type { runProjectAudit } from "@/trigger/audit.trigger";
import { validateSafeUrl, normalizeUrl } from "@/server/intelligence/security/egress-guard";
import { directDb } from "@/shared/db";

const AuditSchema = z.object({
  projectId: z.string().uuid(),
});

export interface StartAuditResponse {
  success: boolean;
  auditId: string;
  projectId?: string;
  userId?: string;
  message?: string;
}

export const triggerAudit = authenticatedAction(
  AuditSchema,
  async ({ projectId }, { user, tx }): Promise<StartAuditResponse> => {
    const projectResult = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
      .limit(1);

    if (projectResult.length === 0) {
      throw new Error("Project not found or access denied");
    }

    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const [recentAudit] = await tx
      .select({ id: audits.id, createdAt: audits.createdAt })
      .from(audits)
      .where(and(eq(audits.projectId, projectId), gt(audits.createdAt, thirtySecondsAgo)))
      .limit(1);

    if (recentAudit) {
      const waitTime = Math.ceil((recentAudit.createdAt!.getTime() + 30000 - Date.now()) / 1000);
      return { success: false, auditId: "", message: `Espera ${waitTime}s antes de otra auditoria.` };
    }

    const [audit] = await tx.insert(audits).values({
      projectId, type: "full", status: "pending", startedAt: new Date(), createdBy: user.id,
    }).returning();

    return { success: true, auditId: audit.id, projectId, userId: user.id };
  }
);

async function runLocalAudit(projectId: string, auditId: string, userId: string) {
  console.log(`[LocalAudit] Iniciando ${auditId}`);
  try {
    const [audit] = await directDb.update(audits)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(audits.id, auditId))
      .returning();
    if (!audit) throw new Error(`Auditoria ${auditId} no encontrada`);

    const [project] = await directDb.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new Error(`Proyecto ${projectId} no encontrado`);
    if (project.ownerId !== userId) throw new Error("Acceso denegado");

    const targetUrl = normalizeUrl(project.domain);
    const analysis = await analyzeUrl(targetUrl);
    console.log(`[LocalAudit] Status: ${analysis.statusCode}`);

    await directDb.insert(crawlResults).values({
      auditId, url: targetUrl,
      statusCode: analysis.statusCode, contentType: analysis.contentType,
      title: analysis.title, metaDescription: analysis.metaDescription,
      h1Tags: analysis.h1Tags, h2Tags: analysis.h2Tags,
      wordCount: analysis.wordCount,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic issue objects
    const issuesToInsert: any[] = [];
    if (!analysis.title) {
      issuesToInsert.push({ projectId, auditId, url: targetUrl, severity: "critical" as const, category: "meta" as const, title: "Falta Title Tag", description: "No hay <title>.", recommendation: "Agrega un <title> descriptivo." });
    } else if (analysis.title.length > 60) {
      issuesToInsert.push({ projectId, auditId, url: targetUrl, severity: "warning" as const, category: "meta" as const, title: "Titulo muy largo", description: `${analysis.title.length} caracteres (>60).`, recommendation: "Reduce el titulo a <60 caracteres." });
    }
    if (!analysis.metaDescription) {
      issuesToInsert.push({ projectId, auditId, url: targetUrl, severity: "critical" as const, category: "meta" as const, title: "Falta Meta Description", description: "No se detecto meta description.", recommendation: "Agrega meta description de 120-160 caracteres." });
    } else if (analysis.metaDescription.length > 160) {
      issuesToInsert.push({ projectId, auditId, url: targetUrl, severity: "warning" as const, category: "meta" as const, title: "Meta description muy larga", description: `${analysis.metaDescription.length} caracteres (>160).`, recommendation: "Ajusta a 120-160 caracteres." });
    }
    if (analysis.h1Tags.length === 0) {
      issuesToInsert.push({ projectId, auditId, url: targetUrl, severity: "critical" as const, category: "seo" as const, title: "Falta H1", description: "No hay <h1>.", recommendation: "Agrega un unico <h1>." });
    } else if (analysis.h1Tags.length > 1) {
      issuesToInsert.push({ projectId, auditId, url: targetUrl, severity: "warning" as const, category: "seo" as const, title: "Multiples H1", description: `${analysis.h1Tags.length} H1 encontrados.`, recommendation: "Usa un solo <h1>." });
    }
    if (analysis.wordCount > 0 && analysis.wordCount < 250) {
      issuesToInsert.push({ projectId, auditId, url: targetUrl, severity: "warning" as const, category: "seo" as const, title: "Thin Content", description: `~${analysis.wordCount} palabras (<250).`, recommendation: "Agrega mas contenido (>250 palabras)." });
    }
    if (issuesToInsert.length > 0) await directDb.insert(issues).values(issuesToInsert);

    await directDb.update(audits).set({ status: "completed", completedAt: new Date() }).where(eq(audits.id, auditId));
    console.log(`[LocalAudit] ${auditId} completada.`);
  } catch (err: unknown) {
    const auditErr = err as { message?: string };
    console.error(`[LocalAudit] Error ${auditId}:`, auditErr);
    try {
      await directDb.update(audits).set({ status: "failed", errorMessage: auditErr.message || "Error", completedAt: new Date() }).where(eq(audits.id, auditId));
    } catch (dbErr) { console.error("[LocalAudit] Fallback error:", dbErr); }
  }
}

async function analyzeUrl(targetUrl: string) {
  await validateSafeUrl(targetUrl);
  const response = await fetch(targetUrl, {
    headers: { "User-Agent": "Mozilla/5.0 StrategicAuditBot/1.1", "Accept": "text/html,*/*" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) return { statusCode: response.status, contentType: response.headers.get("content-type") || "unknown", title: null, metaDescription: null, h1Tags: [], h2Tags: [], wordCount: 0 };

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return { statusCode: response.status, contentType, title: null, metaDescription: null, h1Tags: [], h2Tags: [], wordCount: 0 };

  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  let metaDescription: string | null = null;
  const dm1 = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
  const dm2 = html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
  if (dm1) metaDescription = dm1[1].trim();
  else if (dm2) metaDescription = dm2[1].trim();

  const h1Tags: string[] = [];
  const h1r = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  let m1;
  while ((m1 = h1r.exec(html)) !== null) {
    const c = m1[1].replace(/<[^>]*>/g, "").trim();
    if (c) h1Tags.push(c);
  }

  const h2Tags: string[] = [];
  const h2r = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m2;
  while ((m2 = h2r.exec(html)) !== null && h2Tags.length < 30) {
    const c = m2[1].replace(/<[^>]*>/g, "").trim();
    if (c) h2Tags.push(c);
  }

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyText = bodyMatch ? bodyMatch[1].replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, " ") : "";
  const wordCount = bodyText.split(/\s+/).filter(w => w.length > 0).length;

  return { statusCode: response.status, contentType, title, metaDescription, h1Tags, h2Tags, wordCount };
}

export const startAuditAction = async (data: z.infer<typeof AuditSchema>): Promise<ActionState<StartAuditResponse>> => {
  const result = await triggerAudit(data);
  if (result.data?.success && result.data.auditId) {
    try {
      await tasks.trigger<typeof runProjectAudit>("run-project-audit", {
        projectId: result.data.projectId!, auditId: result.data.auditId, userId: result.data.userId!,
      });
      return { data: { success: true, auditId: result.data.auditId } };
    } catch (triggerError: unknown) {
      const te = triggerError as { message?: string };
      console.warn("[Audit] Trigger.dev no disponible, usando fallback local:", te?.message);
      runLocalAudit(result.data.projectId!, result.data.auditId!, result.data.userId!)
        .catch((e: unknown) => console.error("[Audit] Fallback error:", e));
      return { data: { success: true, auditId: result.data.auditId } };
    }
  }
  return result;
};

const StatusSchema = z.object({ auditId: z.string().uuid() });

export const getAuditStatus = authenticatedAction(
  StatusSchema,
  async ({ auditId }, { user, tx }) => {
    const result = await tx
      .select({ audit: audits, project: projects })
      .from(audits)
      .where(eq(audits.id, auditId))
      .innerJoin(projects, eq(audits.projectId, projects.id))
      .limit(1);

    const record = result[0];
    if (!record) return { success: false, message: "Auditoria no encontrada." };
    if (record.project.ownerId !== user.id) throw new Error("Acceso denegado");

    // Watchdog anti-cuelgue: una auditoría 'pending' con más de 3 minutos
    // significa que el worker murió antes de su primer write (p.ej. Trigger.dev
    // con env roto — el error handler tampoco puede escribir a la BD). Se
    // expira para que la UI transicione a 'failed' y el usuario pueda reintentar.
    if (record.audit.status === "pending") {
      const startedAt = record.audit.startedAt?.getTime() ?? 0;
      if (Date.now() - startedAt > 180_000) {
        const message = "El analizador no respondió (worker no disponible). Verifica Trigger.dev y reintenta.";
        await directDb.update(audits)
          .set({ status: "failed", errorMessage: message, completedAt: new Date() })
          .where(eq(audits.id, auditId));
        return { success: true, status: "failed", errorMessage: message };
      }
    }

    return { success: true, status: record.audit.status, errorMessage: record.audit.errorMessage };
  }
);
