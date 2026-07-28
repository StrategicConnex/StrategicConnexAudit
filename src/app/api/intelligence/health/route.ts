import { NextRequest, NextResponse } from "next/server";
import { externalApiHealthChecker } from "@/server/intelligence/core/health-checker";
import { createClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/intelligence/health
 *
 * Returns the current health status of all external APIs that the
 * intelligence engine depends on:
 *   - GeoIP (freeipapi.com / ip-api.com)
 *   - WHOIS/RDAP (rdap.org)
 *   - AI Copilot (OpenRouter / OpenAI)
 *   - DNS Resolver (node:dns/promises)
 *
 * Also exposes circuit breaker states and recent degradation events.
 * The health checker starts monitoring on first access if not already running.
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate (optional — health can be public for monitoring tools)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Start the health checker if not already running
    // (it will only start once due to internal guard)
    externalApiHealthChecker.start();

    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "true";

    if (refresh) {
      // Force an immediate re-check of all APIs
      await externalApiHealthChecker.runAllChecks();
    }

    const report = externalApiHealthChecker.getReport();

    // If user is not authenticated, return limited public data
    if (!user) {
      return NextResponse.json({
        success: true,
        globalStatus: report.globalStatus,
        summary: report.summary,
        timestamp: report.timestamp,
      });
    }

    return NextResponse.json({
      success: true,
      ...report,
    });    } catch (error: any) {
    console.error("[HealthAPI] Error fetching health report:", error);
    return NextResponse.json({
      success: false,
      globalStatus: "degraded",
      error: "Error interno del sistema de monitoreo",
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
