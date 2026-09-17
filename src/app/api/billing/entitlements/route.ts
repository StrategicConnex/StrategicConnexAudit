import { NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { getEntitlements } from "@/server/lib/entitlements";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** GET /api/billing/entitlements — plan y uso del usuario autenticado. */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const entitlements = await getEntitlements(user.id);
    return NextResponse.json({ success: true, entitlements });
  } catch (error) {
    logger.error("GET entitlements failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
