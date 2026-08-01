import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { runSiemExport } from "@/server/security/siem-exporter";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes timeout

export async function POST(req: NextRequest) {
  try {
    // Auth: allow cron secret OR authenticated user
    const authHeader = req.headers.get("authorization");
    const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
      }
    }

    const result = await runSiemExport();

    return NextResponse.json({
      success: true,
      ...result,
      durationMs: Date.now(),
    });
  } catch (error) {
    console.error("POST /api/security/siem/run failure:", error);
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}
