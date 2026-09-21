import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { projects, audits, issues } from "@/shared/db/schemas";
import {
  execBriefs,
  findLatestBrief,
  upsertExecBrief,
} from "@/shared/db/schemas/exec-briefs";
import { callAIWithFallback, getNoApiKeyResponse } from "./ai-router";

/**
 * exec-brief.ts — Resumen ejecutivo por proyecto (Sprint 3, idea #2).
 *
 * Tras cada auditoría completa, el pool IA redacta un briefing NO técnico en
 * español (lo que pasó, lo que preocupa, qué hacer) y se persiste en la tabla
 * `exec_briefs` (1 fila viva por proyecto + historial con replaced_at). El
 * portal cliente (/p/[token]) lo muestra sin que el cliente navegue a la app.
 *
 * Fiabilidad (herencia de los Sprints 1-2):
 *  - Task type `exec-brief`: texto largo (no JSON-crítico), timeout 60s,
 *    cache 24h con scope `brief:{projectId}:{fecha-auditoría}`.
 *  - Zod valida la estructura de salida del modelo (JSON con secciones).
 *  - Fire-and-forget: un fallo de IA JAMÁS marca la auditoría como fallida.
 *  - Sin OPENROUTER_API_KEY: fila con `isFallback=true` y mensaje claro,
 *    mismo patrón que ai_report_jobs.
 */

export const EXEC_BRIEF_PROMPT_VERSION = 1;

// ─── Schemas ────────────────────────────────────────────────────────────────

export const ExecBriefSchema = z.object({
  headline: z.string().min(10).max(200),
  summary: z.string().min(50).max(4000),
  topRisks: z.array(z.string().min(5).max(300)).max(5),
  nextSteps: z.array(z.string().min(5).max(300)).min(1).max(5),
});
export type ExecBriefContent = z.infer<typeof ExecBriefSchema>;

// ─── Recolección de datos del proyecto ──────────────────────────────────────

export interface BriefInput {
  /** Total de hallazgos por severidad de la última auditoría. */
  bySeverity: { critical: number; warning: number; info: number };
  /** 8 hallazgos más relevantes (título + severidad). */
  topIssues: Array<{ title: string; severity: string }>;
  /** Score de salud 0-100 (penalización 10/3/1, mismo criterio del portal). */
  healthScore: number | null;
  domain: string;
  /** Fecha ISO de la auditoría que origina el brief. */
  auditDate: string;
}

/**
 * Recolecta los datos de la última auditoría completada del proyecto.
 * Devuelve null si no hay nada que resumir (sin auditorías completadas).
 */
export async function collectBriefInput(
  projectId: string
): Promise<(BriefInput & { auditId: string }) | null> {
  const [project] = await directDb
    .select({ domain: projects.domain })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;

  const [latest] = await directDb
    .select({ id: audits.id, createdAt: audits.createdAt })
    .from(audits)
    .where(and(eq(audits.projectId, projectId), eq(audits.status, "completed")))
    .orderBy(desc(audits.createdAt))
    .limit(1);
  if (!latest) return null;

  const rows = await directDb
    .select({ severity: issues.severity, title: issues.title })
    .from(issues)
    .where(eq(issues.auditId, latest.id));

  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const r of rows) {
    if (r.severity === "critical") bySeverity.critical++;
    else if (r.severity === "warning") bySeverity.warning++;
    else bySeverity.info++;
  }
  const penalty = bySeverity.critical * 10 + bySeverity.warning * 3 + bySeverity.info * 1;
  const healthScore = Math.max(0, 100 - penalty);

  const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const topIssues = [...rows]
    .sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))
    .slice(0, 8)
    .map((r) => ({ title: r.title, severity: r.severity }));

  return {
    bySeverity,
    topIssues,
    healthScore,
    domain: project.domain,
    auditDate: latest.createdAt ? new Date(latest.createdAt).toISOString() : new Date().toISOString(),
    auditId: latest.id,
  };
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

export function buildBriefPrompt(input: BriefInput): string {
  const sev = input.bySeverity;
  const lista =
    input.topIssues.length > 0
      ? input.topIssues.map((i) => `- [${i.severity}] ${i.title}`).join("\n")
      : "- (sin hallazgos registrados)";
  return (
    `Genera el resumen ejecutivo del proyecto ${input.domain} tras la auditoría del ` +
    `${input.auditDate.slice(0, 10)}.\n\n` +
    `Datos: ${sev.critical} críticos, ${sev.warning} avisos, ${sev.info} informativos. ` +
    `Score de salud estimado: ${input.healthScore ?? "n/d"}/100.\n` +
    `Hallazgos principales:\n${lista}\n\n` +
    `Devuelve EXCLUSIVAMENTE un JSON con esta forma exacta:\n` +
    `{"headline":"titular de 1 frase","summary":"3-5 párrafos cortos en lenguaje NO técnico, ` +
    `sin siglas ni jerga","topRisks":["riesgo 1","riesgo 2"],"nextSteps":["acción 1","acción 2"]}\n\n` +
    `Reglas: español de España; tono ejecutivo tranquilo (sin alarmismo); máximo 3 riesgos y ` +
    `3 acciones; las acciones deben ser entendibles por un gerente sin conocimientos técnicos.`
  );
}

// ─── Servicio ───────────────────────────────────────────────────────────────

export interface BriefRunResult {
  generated: boolean;
  isFallback: boolean;
  modelUsed: string | null;
  briefId: string | null;
  fromCache: boolean;
  error?: string;
}

/**
 * Genera (o reutiliza desde BD) el resumen ejecutivo del proyecto y lo
 * persiste. `userId` atribuye el uso en ai_usage (cuotas); null = sistema.
 * Fire-and-forget por contrato: nunca lanza, devuelve el resultado con error.
 */
export async function runExecBrief(
  projectId: string,
  opts: { userId?: string | null; force?: boolean } = {}
): Promise<BriefRunResult> {
  // 0. Brief vivo ya existente → no gastar llamada (idempotencia ante
  //    reintentos de Trigger.dev y dobles triggers post-audit).
  if (!opts.force) {
    try {
      const existing = await findLatestBrief(projectId);
      if (existing) {
        return {
          generated: false,
          isFallback: existing.isFallback,
          modelUsed: null,
          briefId: existing.id,
          fromCache: false,
        };
      }
    } catch {
      // BD caída: seguir; el flujo normal lo reportará.
    }
  }

  // 1. Datos del proyecto.
  let input: Awaited<ReturnType<typeof collectBriefInput>>;
  try {
    input = await collectBriefInput(projectId);
  } catch (err) {
    return {
      generated: false,
      isFallback: false,
      modelUsed: null,
      briefId: null,
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (!input) {
    return {
      generated: false,
      isFallback: false,
      modelUsed: null,
      briefId: null,
      fromCache: false,
      error: "sin auditorías completadas",
    };
  }

  // 2. Llamada IA (texto largo, no JSON-crítico → cadena con router primero).
  let res;
  try {
    res = await callAIWithFallback({
      taskType: "exec-brief",
      messages: [
        {
          role: "system",
          content:
            "Eres un consultor de ciberseguridad que redacta resúmenes ejecutivos para gerentes " +
            "sin perfil técnico. Escribes en español de España, tono tranquilo y accionable. " +
            "Respondes ÚNICAMENTE con el JSON pedido, sin markdown ni explicaciones.",
        },
        { role: "user", content: buildBriefPrompt(input) },
      ],
      temperature: 0.4,
      maxTokens: 1200,
      responseFormat: { type: "json_object" },
      userId: opts.userId ?? null,
      cacheScope: `brief:${projectId}:${input.auditDate.slice(0, 10)}`,
    });
  } catch (err) {
    return {
      generated: false,
      isFallback: true,
      modelUsed: null,
      briefId: null,
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. Degradación graciosa sin key: fila de fallback con mensaje claro.
  if (!res.success) {
    const content = getNoApiKeyResponse("exec-brief", "es");
    const [row] = await upsertExecBrief({
      projectId,
      content,
      isFallback: true,
      modelUsed: null,
      promptVersion: EXEC_BRIEF_PROMPT_VERSION,
      auditId: input.auditId,
    });
    return {
      generated: true,
      isFallback: true,
      modelUsed: null,
      briefId: row?.id ?? null,
      fromCache: false,
      error: res.error,
    };
  }

  // 4. Parseo + validación Zod (segunda red tras json_object + self-heal).
  let brief: ExecBriefContent;
  try {
    brief = ExecBriefSchema.parse(JSON.parse(res.content));
  } catch (err) {
    return {
      generated: false,
      isFallback: true,
      modelUsed: res.modelUsed,
      briefId: null,
      fromCache: false,
      error: `exec-brief: salida inválida: ${
        err instanceof z.ZodError
          ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; ")
          : String(err)
      }`,
    };
  }

  // 5. Persistencia: markdown ligero con las secciones estructuradas.
  const content = [
    `## ${brief.headline}`,
    "",
    brief.summary,
    "",
    brief.topRisks.length > 0
      ? `**Riesgos principales**\n${brief.topRisks.map((r) => `- ${r}`).join("\n")}`
      : "",
    "",
    `**Próximos pasos**\n${brief.nextSteps.map((s) => `- ${s}`).join("\n")}`,
  ]
    .filter((s) => s !== "")
    .join("\n");

  const [row] = await upsertExecBrief({
    projectId,
    content,
    isFallback: false,
    modelUsed: res.modelUsed,
    promptVersion: EXEC_BRIEF_PROMPT_VERSION,
    auditId: input.auditId,
  });

  return {
    generated: true,
    isFallback: false,
    modelUsed: res.modelUsed,
    briefId: row?.id ?? null,
    fromCache: res.fromCache ?? false,
  };
}

// Re-export para que los callers no importen la tabla directamente.
export { execBriefs };
