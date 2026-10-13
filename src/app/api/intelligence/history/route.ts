/**
 * GET /api/intelligence/history — Historical DNS/WHOIS Query Endpoint
 *
 * Consulta el historial de resoluciones DNS y snapshots WHOIS para
 * un proyecto. Permite filtrar por tipo, dominio, y rango de fechas.
 *
 * Query params:
 *   projectId  (required) - UUID del proyecto
 *   type       (optional) - "dns" | "whois" | "all" | "timeline" (default "all")
 *   query      (optional) - dominio o IP a filtrar
 *   recordType (optional) - para DNS: "A" | "AAAA" | "MX" | etc.
 *   from       (optional) - fecha inicio ISO
 *   to         (optional) - fecha fin ISO
 *   limit      (optional) - max registros (default 50)
 *   offset     (optional) - paginación
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/shared/lib/ratelimit";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { projects } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { queryDnsHistory } from "@/server/intelligence/history/dns-history";
import { queryWhoisHistory } from "@/server/intelligence/history/whois-history";
import { getProjectHistoryTimeline } from "@/server/intelligence/history/orchestrator";
import { getErrorMessage } from "@/shared/lib/errors";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function handler(_req: NextRequest, userId: string) {
  try {
    const { searchParams } = new URL(_req.url);
    const projectId = searchParams.get("projectId");
    const type = searchParams.get("type") || "all";
    const query = searchParams.get("query") || undefined;
    const recordType = searchParams.get("recordType") || undefined;
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId es requerido" }, { status: 400 });
    }

    // Ownership y lecturas de historial en la MISMA transacción: dentro de ella
    // la sesión es `authenticated` con el `sub` del usuario, así que las policies
    // de `dns_history`/`whois_history` (0027) deciden qué filas existen. Antes el
    // ownership se comprobaba aquí y las lecturas se hacían con directDb (bypass
    // de RLS): una única barrera, la de este archivo.
    const access = await withRLS(userId, async (tx) => {
      const ownedProject = await tx.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: { id: true },
      });

      if (!ownedProject) return null;

      return {
        dns: type === "dns" || type === "all"
          ? await queryDnsHistory(tx, { projectId, query, recordType, from, to, limit, offset })
          : null,
        whois: type === "whois" || type === "all"
          ? await queryWhoisHistory(tx, { projectId, domain: query, from, to, limit, offset })
          : null,
        timeline: type === "timeline" && query
          ? await getProjectHistoryTimeline(tx, projectId, query)
          : null,
      };
    });

    if (!access) {
      return NextResponse.json(
        { success: false, error: "Proyecto no encontrado o acceso denegado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      type,
      projectId,
      dns: access.dns,
      whois: access.whois,
      timeline: access.timeline,
    });
  } catch (error: unknown) {
    logger.error("[History API] Error:", { error: getErrorMessage(error) })
    return NextResponse.json({ success: false, error: `Error al consultar historial: ${getErrorMessage(error)}` }, { status: 500 });
  }
}

export const GET = (req: NextRequest) =>
  withRateLimit(
    {
      limit: 30,
      window: 60,
      prefix: "intel_history",
      authenticate: async (_req) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        return user ? { id: user.id } : null;
      },
    },
    handler,
  )(req);
