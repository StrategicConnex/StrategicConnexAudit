import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { loadPortfolio } from "@/server/analytics/queries";
import { MITRE_TACTICS } from "@/server/intelligence/mitre/mapping";
import { withErrorHandler } from "@/server/lib/error-handler";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio
 *
 * Roll-up cross-proyecto (B2): score corporativo, peor postura, carga de
 * hallazgos y MTTR. El alcance lo fija RLS — solo entra lo que el usuario
 * puede ver — y `corporateScore` llega null cuando ningún proyecto tiene
 * auditoría completada.
 */
const rawGetHandler = withErrorHandler(async (_req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const portfolio = await loadPortfolio(user.id);

  return NextResponse.json({
    success: true,
    portfolio,
    // Viaja al cliente para que la vista reuse el mismo registro de tácticas
    // que /mitre-coverage, en vez de mantener una lista paralela desincronizada.
    frameworkTactics: MITRE_TACTICS.map((t) => ({ id: t.id, name: t.name })),
  });
});

export const GET = withRequestContext(rawGetHandler);