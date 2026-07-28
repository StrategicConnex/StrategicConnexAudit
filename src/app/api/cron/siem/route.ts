import { NextResponse } from "next/server";
import { runSiemExport } from "@/server/security/siem-exporter";

export const maxDuration = 120; // 2 minutes timeout
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/siem
 * Cron job que ejecuta el exportador SIEM cada 5 minutos.
 *
 * Vercel CRON → GET request con header "Authorization: Bearer ${CRON_SECRET}".
 * Detección: múltiples open_redirect_attempt, rate_limit_bypass, CSP violations,
 * auth_failure bursts desde una misma IP en pocos minutos.
 *
 * Alertas enviadas a: Slack, PagerDuty, Splunk (según env vars configuradas).
 */
export async function GET(request: Request) {
  try {
    // 1. Verify Vercel Cron Secret
    const authHeader = request.headers.get("authorization");
    if (
      process.env.NODE_ENV === "production" &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Run SIEM export
    const result = await runSiemExport();

    // 3. Return structured result
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || "development",
    });
  } catch (error: unknown) {
    const cronErr = error as { message?: string };
    console.error("GET /api/cron/siem failure:", cronErr);
    return NextResponse.json({
      success: false,
      error: "SIEM cron error",
      message: cronErr.message || "Unknown error",
    }, { status: 500 });
  }
}
