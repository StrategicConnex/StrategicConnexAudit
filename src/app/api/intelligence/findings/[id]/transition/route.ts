import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { withRLS } from "@/shared/db/rls";
import { requireProjectPermission } from "@/server/lib/project-access";
import {
  transitionFinding,
  getFindingScope,
} from "@/server/intelligence/findings/workflow";
import { withErrorHandler } from "@/server/lib/error-handler";
import { ValidationError, NotFoundError, ForbiddenError } from "@/server/lib/app-error";
import { FindingTransitionSchema } from "@/shared/schemas/api";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * POST /api/intelligence/findings/[id]/transition
 *
 * Mueve el hallazgo en el Kanban. El cuerpo lleva `projectId` explícito: la
 * autorización se evalúa sobre el proyecto, no sobre el id del hallazgo, para
 * que un id filtrado de otro tenant no sirva de nada (el scope real se
 * comprueba contra la fila cargada).
 */
const rawPostHandler = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getCurrentUserOrThrow();
    const { id } = await ctx.params;

    const parsed = FindingTransitionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new ValidationError("Datos inválidos");
    }
    const { projectId, toStatus, note } = parsed.data;

    const denied = await requireProjectPermission(user.id, projectId, "scan:execute");
    if (denied) {
      throw denied === "Proyecto no encontrado"
        ? new NotFoundError("Proyecto", projectId)
        : new ForbiddenError(denied);
    }

    // El scope y la transición van en la MISMA transacción RLS: dentro de ella
    // la sesión es `authenticated`, así que las policies de
    // `intelligence_findings` (0022 lee, 0046 actualiza) vuelven a acotar la
    // fila. La autorización del cuerpo (`projectId`) sigue siendo la primera
    // barrera —un id de otro tenant no sirve de nada— y la policy es la segunda:
    // antes sólo existía la primera porque la escritura iba con `directDb`.
    const result = await withRLS(user.id, async (tx) => {
      const scope = await getFindingScope(tx, id);
      if (!scope || scope.projectId !== projectId) return null;

      return transitionFinding(tx, {
        findingId: id,
        toStatus,
        actorId: user.id,
        note: note ?? null,
      });
    });

    if (!result) {
      throw new NotFoundError("Hallazgo", id);
    }
    if (!result.ok) {
      if (result.reason === "not_found") throw new NotFoundError("Hallazgo", id);
      throw new ValidationError(result.message);
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      dueAt: result.dueAt,
    });
  },
);

export const POST = withRequestContext(rawPostHandler);
