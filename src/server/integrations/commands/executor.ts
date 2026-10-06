import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { audits, intelligenceFindings, projects } from "@/shared/db/schemas";
import {
  FINDING_STATUSES,
  TERMINAL_STATUSES,
  getFindingScope,
  transitionFinding,
} from "@/server/intelligence/findings/workflow";
import {
  formatAckResult,
  formatError,
  formatHelp,
  formatScanPending,
  formatStatus,
  shortId,
  type CommandResponse,
  type ParsedCommand,
} from "./commands";

/**
 * executor.ts — Ejecución de comandos del bot (Tanda 4 / B16).
 *
 * Autorización sin inventar identidades: el bot no mapea usuarios de Slack a
 * usuarios de la plataforma, así que solo puede operar sobre proyectos de una
 * allowlist explícita (`SLACK_ALLOWED_PROJECT_IDS`). El ACK pasa por la MISMA
 * máquina de estados que usa el panel (`transitionFinding`), así que no hay
 * una segunda vía de escritura que pueda saltarse las transiciones legales.
 */

export interface CommandContext {
  /** Proyectos autorizados para el bot. */
  allowedProjectIds: string[];
  /** Origen humano del comando, para la nota del historial. */
  source?: string;
}

/** `A,B ,, C` → `["A","B","C"]`. Sin env → sin proyectos autorizados. */
export function parseAllowedProjectIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function projectNotAllowedMessage(projectId: string): string {
  return `El proyecto \`${shortId(projectId)}\` no está autorizado para el bot. Añádelo a \`SLACK_ALLOWED_PROJECT_IDS\` para habilitarlo.`;
}

/** Estados que cuentan como "abierto" (todo lo que no es terminal). */
function openStatuses(): string[] {
  return FINDING_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s));
}

export async function runScAuditCommand(
  command: ParsedCommand,
  ctx: CommandContext,
): Promise<CommandResponse> {
  try {
    switch (command.name) {
      case "help":
        return formatHelp();

      case "scan":
        // Reconocido y explícito: NO se lanza nada desde aquí.
        return formatScanPending(command.args[0] ?? null);

      case "status":
        return await runStatus(command, ctx);

      case "ack":
        return await runAck(command, ctx);

      default: {
        const exhaustive: never = command.name;
        return formatError(`Comando no soportado: ${String(exhaustive)}`);
      }
    }
  } catch (err) {
    return formatError(`Error al ejecutar el comando: ${(err as Error).message?.slice(0, 200)}`);
  }
}

async function runStatus(command: ParsedCommand, ctx: CommandContext): Promise<CommandResponse> {
  const projectId = command.args[0];
  if (!projectId) {
    return formatError("Falta el projectId. Uso: `status <projectId>`.");
  }
  if (!ctx.allowedProjectIds.includes(projectId)) {
    return formatError(projectNotAllowedMessage(projectId));
  }

  const project = await directDb.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { id: true, name: true, domain: true },
  });
  if (!project) {
    return formatError("Proyecto no encontrado.");
  }

  const statusFilter = inArray(intelligenceFindings.status, openStatuses());

  const counts = await directDb
    .select({
      severity: intelligenceFindings.severity,
      n: sql<number>`count(*)::int`,
    })
    .from(intelligenceFindings)
    .where(and(eq(intelligenceFindings.projectId, projectId), statusFilter))
    .groupBy(intelligenceFindings.severity);

  const recent = await directDb
    .select({
      id: intelligenceFindings.id,
      severity: intelligenceFindings.severity,
      title: intelligenceFindings.title,
    })
    .from(intelligenceFindings)
    .where(and(eq(intelligenceFindings.projectId, projectId), statusFilter))
    .orderBy(desc(intelligenceFindings.createdAt))
    .limit(5);

  const lastAudit = await directDb.query.audits.findFirst({
    where: and(eq(audits.projectId, projectId), eq(audits.status, "completed")),
    orderBy: [desc(audits.createdAt)],
    columns: { completedAt: true },
  });

  const bySeverity: Record<string, number> = {};
  let openCount = 0;
  for (const row of counts) {
    bySeverity[row.severity] = row.n;
    openCount += row.n;
  }

  return formatStatus({
    projectName: project.name,
    domain: project.domain ?? null,
    openCount,
    bySeverity,
    recent,
    // Sin escaneo completado se informa "sin datos", no una fecha inventada.
    lastAuditAt: lastAudit?.completedAt?.toISOString() ?? null,
  });
}

async function runAck(command: ParsedCommand, ctx: CommandContext): Promise<CommandResponse> {
  const findingId = command.args[0];
  if (!findingId) {
    return formatError("Falta el findingId. Uso: `ack <findingId>`.");
  }

  const scope = await getFindingScope(findingId);
  if (!scope) {
    return formatError("Hallazgo no encontrado.");
  }
  if (!ctx.allowedProjectIds.includes(scope.projectId)) {
    return formatError(projectNotAllowedMessage(scope.projectId));
  }

  const result = await transitionFinding({
    findingId,
    toStatus: "acknowledged",
    // Sin identidad de plataforma: la nota deja constancia de quién lo hizo.
    actorId: null,
    note: `ACK desde ${ctx.source ?? "el bot"}`,
  });

  if (!result.ok) {
    return formatError(result.message);
  }

  return formatAckResult({ findingId, status: result.status, dueAt: result.dueAt });
}
