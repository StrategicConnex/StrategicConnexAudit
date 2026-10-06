import { NextRequest, NextResponse } from "next/server";
import { withRLS } from "@/shared/db/rls";
import { projects, webhookConfigs } from "@/shared/db/schemas";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { withRequestContext } from "@/lib/request-context";
import { defaultDeliveryDeps, deliverWebhook } from "@/server/webhooks/delivery";
import { WEBHOOK_TEST_EVENT, getWebhookEvent } from "@/shared/lib/webhook-events";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/[id]/test?projectId=
 *
 * Entrega un evento `webhook.test` al destino y devuelve el resultado REAL.
 * Reutiliza `deliverWebhook` (el mismo módulo que corre en el task de
 * Trigger.dev), así que la firma HMAC, las cabeceras y el guard SSRF que se
 * prueban aquí son exactamente los de producción.
 *
 * Respuestas:
 *  - 200 { success: true, delivered: 1, status }      → el endpoint respondió 2xx
 *  - 502 { success: false, error, status }            → el endpoint falló (o la URL no es alcanzable)
 *  - 404                                               → webhook ajeno o inexistente
 */
async function rawPost(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // Extracción resiliente del id desde el path (/api/webhooks/<id>/test).
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const id = pathParts[pathParts.indexOf("test") - 1];
    const projectId = url.searchParams.get("projectId");

    if (!id || !projectId) {
      return NextResponse.json(
        { success: false, error: "Faltan parámetros id o projectId" },
        { status: 400 }
      );
    }

    const lookup = await withRLS(user.id, async (tx) => {
      const project = await tx.query.projects.findFirst({ where: eq(projects.id, projectId) });
      if (!project) {
        return { ok: false as const, status: 404, error: "Proyecto no encontrado" };
      }
      const config = await tx.query.webhookConfigs.findFirst({
        where: and(eq(webhookConfigs.id, id), eq(webhookConfigs.projectId, projectId)),
      });
      if (!config) {
        return { ok: false as const, status: 404, error: "Webhook no encontrado" };
      }
      return { ok: true as const, config };
    });

    if (!lookup.ok) {
      return NextResponse.json({ success: false, error: lookup.error }, { status: lookup.status });
    }

    const { config } = lookup;
    const delivery = await deliverWebhook(
      {
        id: config.id,
        url: config.url,
        secretToken: config.secretToken,
        events: config.events,
      },
      {
        id: `test_${config.id}`,
        event: WEBHOOK_TEST_EVENT,
        data: {
          message: "Entrega de prueba de StrategicAudit Pro. Si lees esto, tu endpoint y la firma están bien.",
          sample: getWebhookEvent("finding.created")?.sample ?? {},
        },
      },
      defaultDeliveryDeps({
        logger: {
          info: (msg: string) => logger.info(msg),
          error: (msg: string) => logger.error(msg),
        },
      }),
    );

    if (!delivery.ok) {
      // Se informa el error real: un 200 aquí haría creer al cliente que su
      // integración funciona cuando no es así.
      return NextResponse.json(
        {
          success: false,
          delivered: 0,
          error: delivery.error ?? "La entrega falló",
          status: delivery.status ?? null,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      delivered: 1,
      status: delivery.status ?? null,
    });
  } catch (error: unknown) {
    logger.error("POST webhooks/[id]/test failure:", { error: getErrorMessage(error) });
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export const POST = withRequestContext(rawPost);
