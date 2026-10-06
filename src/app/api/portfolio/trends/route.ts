import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { requireProjectPermission } from "@/server/lib/project-access";
import { loadTrends } from "@/server/analytics/queries";
import { withErrorHandler } from "@/server/lib/error-handler";
import { ValidationError, NotFoundError, ForbiddenError } from "@/server/lib/app-error";
import { TrendsQuerySchema } from "@/shared/schemas/api";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio/trends?projectId=&bucket=week&window=12
 *
 * Series de score, MTTR y uptime (B9). Los buckets vacíos no se rellenan:
 * llegan holes (`score: null`) y la UI dibuja la línea partida, porque un 0
 * en un hueco se lee como "fallamos ese día".
 */
const rawGetHandler = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const params = new URL(req.url).searchParams;

  const parsed = TrendsQuerySchema.safeParse({
    projectId: params.get("projectId"),
    bucket: params.get("bucket") ?? undefined,
    window: params.get("window") ?? undefined,
  });
  if (!parsed.success) {
    throw new ValidationError("projectId, bucket o window inválidos");
  }
  const { projectId, bucket, window } = parsed.data;

  const denied = await requireProjectPermission(user.id, projectId, "report:view");
  if (denied) {
    throw denied === "Proyecto no encontrado"
      ? new NotFoundError("Proyecto", projectId)
      : new ForbiddenError(denied);
  }

  const trends = await loadTrends(user.id, bucket, window);
  return NextResponse.json({ success: true, bucket, window, trends });
});

export const GET = withRequestContext(rawGetHandler);