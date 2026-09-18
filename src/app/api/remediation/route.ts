import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { requireProjectPermission } from "@/server/lib/project-access";
import { listActions, proposeAction, approveAction, executeAction } from "@/server/lib/remediation/service";
import { CONNECTORS, type RemediationConnector } from "@/server/lib/remediation/connectors";
import { withErrorHandler } from "@/server/lib/error-handler";
import { ValidationError, NotFoundError, ForbiddenError } from "@/server/lib/app-error";
import { ProjectIdSchema } from "@/shared/schemas/api";

export const dynamic = "force-dynamic";

const CONNECTOR_IDS = CONNECTORS.map((c) => c.id);

/**
 * GET /api/remediation?projectId= — lista acciones (report:view).
 * POST — propone (scan:execute). PUT?action=approve|execute (admin+).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const parsed = ProjectIdSchema.safeParse({ projectId: new URL(req.url).searchParams.get("projectId") });
  if (!parsed.success) {
    throw new ValidationError("Falta projectId o formato inválido");
  }
  const { projectId } = parsed.data;
  const denied = await requireProjectPermission(user.id, projectId, "report:view");
  if (denied) {
    throw denied === "Proyecto no encontrado"
      ? new NotFoundError("Proyecto", projectId)
      : new ForbiddenError(denied);
  }
  const actions = await listActions(projectId);
  return NextResponse.json({
    success: true,
    actions: actions.map((a) => ({
      id: a.id,
      title: a.title,
      connector: a.connector,
      status: a.status,
      steps: a.steps,
      result: a.result,
      vulnerabilityTitle: a.vulnerabilityTitle,
      createdAt: a.createdAt?.toISOString() ?? null,
    })),
    connectors: CONNECTORS,
  });
});

const proposeSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  connector: z.enum(CONNECTOR_IDS as [RemediationConnector, ...RemediationConnector[]]),
  config: z.record(z.string(), z.string().max(4096)).default({}),
  steps: z.array(z.string().max(500)).max(20).optional(),
  assessmentId: z.string().uuid().optional(),
  vulnerabilityTitle: z.string().max(200).optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const parsed = proposeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new ValidationError("Datos inválidos");
  }
  const denied = await requireProjectPermission(user.id, parsed.data.projectId, "scan:execute");
  if (denied) {
    throw denied === "Proyecto no encontrado"
      ? new NotFoundError("Proyecto", parsed.data.projectId)
      : new ForbiddenError(denied);
  }
  const id = await proposeAction({ ...parsed.data, createdBy: user.id });
  return NextResponse.json({ success: true, id });
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const body = await req.json().catch(() => ({}));
  const parsed = z
    .object({ id: z.string().uuid(), op: z.enum(["approve", "execute"]), projectId: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Datos inválidos");
  }
  const denied = await requireProjectPermission(user.id, parsed.data.projectId, "project:update");
  if (denied) {
    throw denied === "Proyecto no encontrado"
      ? new NotFoundError("Proyecto", parsed.data.projectId)
      : new ForbiddenError(denied);
  }
  if (parsed.data.op === "approve") {
    await approveAction(parsed.data.id);
    return NextResponse.json({ success: true, status: "approved" });
  }
  const result = await executeAction(parsed.data.id);
  return NextResponse.json({ success: true, status: "verified", result });
});
