import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { sendTestAlert } from "@/server/security/siem-exporter";

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
    // Auth: cron secret OR authenticated user
    const authHeader = req.headers.get("authorization");
    const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
      }
    }

    const result = await sendTestAlert();

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("GET /api/security/siem/test failure:", error);
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}
