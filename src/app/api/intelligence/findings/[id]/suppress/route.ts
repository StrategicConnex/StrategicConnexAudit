import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { requireProjectPermission } from "@/server/lib/project-access";
import { suppressFinding, getFindingScope } from "@/server/intelligence/findings/workflow";
import { withErrorHandler } from "@/server/lib/error-handler";
import { ValidationError, NotFoundError, ForbiddenError } from "@/server/lib/app-error";
import { FindingSuppressSchema } from "@/shared/schemas/api";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * POST /api/intelligence/findings/[id]/suppress
 *
 * Silencia un hallazgo ruidoso hasta una fecha, con motivo obligatorio. No lo
 * cierra: sigue visible en el tablero, pero deja de escalar por SLA (B6).
 */
const rawPostHandler = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getCurrentUserOrThrow();
    const { id } = await ctx.params;

    const parsed = FindingSuppressSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new ValidationError("Datos inválidos");
    }
    const { projectId, reason, hours } = parsed.data;

    const denied = await requireProjectPermission(user.id, projectId, "scan:execute");
    if (denied) {
      throw denied === "Proyecto no encontrado"
        ? new NotFoundError("Proyecto", projectId)
        : new ForbiddenError(denied);
    }

    const scope = await getFindingScope(id);
    if (!scope || scope.projectId !== projectId) {
      throw new NotFoundError("Hallazgo", id);
    }

    const result = await suppressFinding({
      findingId: id,
      actorId: user.id,
      reason,
      hours,
    });
    if (!result.ok) {
      throw new NotFoundError("Hallazgo", id);
    }

    return NextResponse.json({ success: true, suppressedUntil: result.suppressedUntil });
  },
);

export const POST = withRequestContext(rawPostHandler);
