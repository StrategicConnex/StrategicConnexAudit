import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { withRLS } from "@/shared/db/rls";
import { projects, intelligenceToolRuns } from "@/shared/db/schemas";
import { runToolSchema } from "@/features/intelligence/validators/intelligence.schema";
import { assertPublicHostname } from "@/server/intelligence/security/egress-guard";
import { getToolDefinition } from "@/server/intelligence/core/tool-registry";
import { executeAndRecordToolRun } from "@/server/intelligence/tool-run";
import { enqueueScanJob, wakeScanQueueDrain, QueueFullError } from "@/server/intelligence/scan-queue";
import { isFlagEnabled } from "@/shared/lib/flags";
import { checkIntelScanRateLimit, buildRateLimitHeaders } from "@/shared/lib/ratelimit";
import { getErrorMessage } from "@/shared/lib/errors";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";
import { withIdempotency } from "@/shared/lib/idempotency";

export const dynamic = "force-dynamic";

async function rawGet(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const investigationId = searchParams.get("investigationId");

    if (!projectId && !investigationId) {
      return NextResponse.json({
        success: false,
        error: "Se requiere 'projectId' o 'investigationId' para listar ejecuciones"
      }, { status: 400 });
    }

    const runs = await withRLS(user.id, async (tx) => {
      if (investigationId) {
        return await tx.query.intelligenceToolRuns.findMany({
          where: eq(intelligenceToolRuns.investigationId, investigationId),
          orderBy: [desc(intelligenceToolRuns.completedAt)],
          limit: 100
        });
      }
      
      if (projectId) {
        return await tx.query.intelligenceToolRuns.findMany({
          where: eq(intelligenceToolRuns.projectId, projectId!),
          orderBy: [desc(intelligenceToolRuns.completedAt)],
          limit: 100
        });
      }

      return [];
    });

    return NextResponse.json({
      success: true,
      runs
    });

  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    logger.error("GET intelligence runs failure:", { error: getErrorMessage(error) })
    return NextResponse.json({
      success: false,
      error: msg === "No autorizado" ? "No autorizado" : "Error interno del servidor"
    }, { status: msg === "No autorizado" ? 401 : 500 });
  }
}

export const GET = withRequestContext(rawGet);

async function rawPost(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow();

    // A6: `Idempotency-Key` opcional — un reintento no vuelve a ejecutar la tool.
    return await withIdempotency(req, { userId: user.id, endpoint: "POST /api/intelligence/runs" }, async () => {
    const body = await req.json();

    const parseResult = runToolSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({
        success: false,
        error: "Argumentos inválidos: " + parseResult.error.issues.map(i => i.message).join(", ")
      }, { status: 400 });
    }

    const { projectId, investigationId, toolId, input } = parseResult.data;

    // Rate limit (SECURITY: misma cuota que el resto del motor intelligence —
    // antes esta ruta permitía abusar de APIs externas saltándose el quota)
    const rateLimit = await checkIntelScanRateLimit(user.id);
    if (!rateLimit.success) {
      return NextResponse.json(
        { success: false, error: "Límite de escaneos excedido. Inténtalo más tarde." },
        { status: 429, headers: buildRateLimitHeaders(rateLimit) },
      );
    }

    // Verificar si la herramienta existe en el registro
    const toolDef = getToolDefinition(toolId);
    if (!toolDef) {
      return NextResponse.json({
        success: false,
        error: `Herramienta diagnóstica '${toolId}' no está registrada.`
      }, { status: 404 });
    }

    // Verificar acceso al proyecto a través de RLS
    const project = await withRLS(user.id, async (tx) => {
      return await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado o acceso denegado" }, { status: 404 });
    }

    // Validar el target del input
    const target = (input.target as string || "").trim().toLowerCase();
    if (!target) {
      return NextResponse.json({
        success: false,
        error: "Falta argumento 'target' en el input de la herramienta"
      }, { status: 400 });
    }

    // Control preventivo de SSRF
    try {
      await assertPublicHostname(target);
    } catch (ssrfError: unknown) {
      return NextResponse.json({
        success: false,
        error: `Acceso denegado por EgressGuard: ${getErrorMessage(ssrfError)}`
      }, { status: 403 });
    }

    // C3: si la cola de escaneo está activa para este usuario, el trabajo se
    // ENCOLA y lo ejecuta el worker fuera del request HTTP (sin el timeout de
    // la función serverless). El flag es fail-closed: por defecto el camino
    // sigue siendo el síncrono de abajo. Si la cola no está disponible, NO
    // rompemos la request: se cae al camino síncrono. La única excepción es la
    // contrapresión (`QueueFullError`): ahí la request SÍ se rechaza con 429,
    // porque ejecutar en línea haría justo el trabajo que la cola rechazó.
    if (isFlagEnabled("scanQueue", { userId: user.id })) {
      try {
        const job = await enqueueScanJob({
          projectId,
          userId: user.id,
          toolId,
          target,
          input,
          investigationId,
        });
        if (job) {
          void wakeScanQueueDrain();
          return NextResponse.json({ success: true, queued: true, job }, { status: 202 });
        }
        logger.warn("[intelligence/runs] la cola no está disponible; se ejecuta en línea", {
          projectId,
          toolId,
        });
      } catch (error: unknown) {
        // Contrapresión (C3): la cola activa del proyecto ya alcanzó el límite de
        // su plan. Se responde 429 accionable —reintentar cuando drene— en vez de
        // degradar al camino síncrono, que volvería a saturar el pool con el
        // trabajo que la cola acaba de rechazar.
        if (error instanceof QueueFullError) {
          logger.warn("[intelligence/runs] cola de escaneo llena; se rechaza el encolado", {
            projectId,
            toolId,
            depth: error.depth,
            limit: error.limit,
          });
          return NextResponse.json(
            {
              success: false,
              error: error.message,
              queue: { depth: error.depth, limit: error.limit },
            },
            { status: 429 },
          );
        }
        throw error;
      }
    }

    // Camino síncrono (por defecto): ejecuta y persiste run + findings + outbox.
    const { success, run } = await executeAndRecordToolRun({
      userId: user.id,
      projectId,
      investigationId,
      toolId,
      target,
      input,
    });

    return NextResponse.json({
      success,
      run
    });
    });
  } catch (error: unknown) {
    const msg = getErrorMessage(error);
    logger.error("POST intelligence run failure:", { error: getErrorMessage(error) })
    return NextResponse.json({
      success: false,
      error: msg === "No autorizado" ? "No autorizado" : `Error al ejecutar herramienta: ${msg}`
    }, { status: msg === "No autorizado" ? 401 : 500 });
  }
}

export const POST = withRequestContext(rawPost);

