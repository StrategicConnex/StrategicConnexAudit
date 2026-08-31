import { NextRequest, NextResponse } from "next/server";
import { sendTestAlert } from "@/server/security/siem-exporter";
import { isCronSecretMatched } from "@/server/auth/cron";
import { requireAdmin } from "@/server/auth/admin";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/security/siem/test
 *
 * Envía un evento de prueba a todos los webhooks SIEM configurados
 * (Slack, PagerDuty, Splunk) para verificar conectividad.
 *
 * No modifica la base de datos. El evento de prueba incluye un label
 * "🧪 SIEM Test Alert" para identificarlo fácilmente en los destinos.
 *
 * Respuesta:
 *   {
 *     success: true,
 *     targetsAttempted: 2,
 *     details: [
 *       { name: "Slack",     status: "ok",    message: "200 OK" },
 *       { name: "Splunk",    status: "error", message: "401: Invalid token" }
 *     ]
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    // Auth: cron secret OR platform-admin user
    const authHeader = req.headers.get("authorization");
    const isCron = isCronSecretMatched(authHeader);

    if (!isCron) {
      const gate = await requireAdmin();
      if (!gate.ok) {
        return gate.response;
      }
    }

    const result = await sendTestAlert();

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("GET /api/security/siem/test failure:", { error: getErrorMessage(error) })
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}
