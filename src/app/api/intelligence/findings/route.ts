import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { requireProjectPermission } from "@/server/lib/project-access";
import { listFindingsForBoard, FINDING_TRANSITIONS } from "@/server/intelligence/findings/workflow";
import { FINDING_STATUSES, type FindingStatus } from "@/server/intelligence/findings/workflow";
import { withErrorHandler } from "@/server/lib/error-handler";
import { ValidationError, NotFoundError, ForbiddenError } from "@/server/lib/app-error";
import { ProjectIdSchema, FindingStatusSchema } from "@/shared/schemas/api";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/intelligence/findings?projectId=&status=open&status=in_progress
 *
 * Tablero de triage: hallazgos del proyecto agrupables por estado. La lectura
 * va por withRLS (ver workflow.ts) además del gate de permiso de aquí.
 */
const rawGetHandler = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const params = new URL(req.url).searchParams;

  const parsed = ProjectIdSchema.safeParse({ projectId: params.get("projectId") });
  if (!parsed.success) {
    throw new ValidationError("Falta projectId o formato inválido");
  }
  const { projectId } = parsed.data;

  const rawStatuses = params.getAll("status");
  const statuses: FindingStatus[] = [];
  for (const raw of rawStatuses) {
    const s = FindingStatusSchema.safeParse(raw);
    if (!s.success) {
      throw new ValidationError(`Estado inválido: ${raw}`);
    }
    statuses.push(s.data);
  }

  const denied = await requireProjectPermission(user.id, projectId, "report:view");
  if (denied) {
    throw denied === "Proyecto no encontrado"
      ? new NotFoundError("Proyecto", projectId)
      : new ForbiddenError(denied);
  }

  const findings = await listFindingsForBoard({
    userId: user.id,
    projectId,
    statuses: statuses.length ? statuses : undefined,
  });

  return NextResponse.json({
    success: true,
    findings,
    statuses: FINDING_STATUSES,
    // La máquina de estados viaja al cliente: el Kanban decide qué movimientos
    // ofrecer con la MISMA tabla que valida el servidor, sin duplicarla.
    transitions: FINDING_TRANSITIONS,
  });
});

export const GET = withRequestContext(rawGetHandler);
