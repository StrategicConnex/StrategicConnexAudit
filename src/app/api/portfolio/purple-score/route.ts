import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { requireProjectPermission } from "@/server/lib/project-access";
import { loadPurpleScore } from "@/server/analytics/queries";
import { MITRE_TACTICS } from "@/server/intelligence/mitre/mapping";
import { tacticCoverage } from "@/server/analytics/purple-score";
import { withErrorHandler } from "@/server/lib/error-handler";
import { ValidationError, NotFoundError, ForbiddenError } from "@/server/lib/app-error";
import { PurpleScoreQuerySchema } from "@/shared/schemas/api";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio/purple-score?projectId=&days=90
 *
 * Purple team (B5): qué técnicas del framework quedaron expuestas, cuáles las
 * detectó el producto y cuáles nunca se probaron. El `deltaPoints` viaja tal
 * cual: si la ventana anterior no tiene datos llega null, no 0, para que la
 * vista no anuncie una mejora que nadie midió.
 */
const rawGetHandler = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const params = new URL(req.url).searchParams;

  const parsed = PurpleScoreQuerySchema.safeParse({
    projectId: params.get("projectId"),
    days: params.get("days") ?? undefined,
  });
  if (!parsed.success) {
    throw new ValidationError("projectId o days inválidos");
  }
  const { projectId, days } = parsed.data;

  const denied = await requireProjectPermission(user.id, projectId, "report:view");
  if (denied) {
    throw denied === "Proyecto no encontrado"
      ? new NotFoundError("Proyecto", projectId)
      : new ForbiddenError(denied);
  }

  const trend = await loadPurpleScore(user.id, projectId, days);
  const framework = MITRE_TACTICS.map((t) => t.name);

  return NextResponse.json({
    success: true,
    days,
    purple: trend,
    tactics: tacticCoverage(trend.current, framework),
    frameworkTactics: framework,
  });
});

export const GET = withRequestContext(rawGetHandler);