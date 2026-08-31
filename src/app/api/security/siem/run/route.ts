import { NextRequest, NextResponse } from "next/server";
import { runSiemExport } from "@/server/security/siem-exporter";
import { isCronSecretMatched } from "@/server/auth/cron";
import { requireAdmin } from "@/server/auth/admin";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes timeout

export async function POST(req: NextRequest) {
  try {
    // Auth: allow cron secret OR platform-admin user
    // (SECURITY: sin el gate de admin, cualquier usuario autenticado podía
    // spamear los canales externos de alerting — Slack/PagerDuty/Splunk)
    const authHeader = req.headers.get("authorization");
    const isCron = isCronSecretMatched(authHeader);

    if (!isCron) {
      const gate = await requireAdmin();
      if (!gate.ok) {
        return gate.response;
      }
    }

    const result = await runSiemExport();

    return NextResponse.json({
      success: true,
      ...result,
      durationMs: Date.now(),
    });
  } catch (error) {
    logger.error("POST /api/security/siem/run failure:", { error: getErrorMessage(error) })
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}
