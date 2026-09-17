import { NextResponse } from "next/server";
import { directDb } from "@/shared/db";
import { subscriptionPlans } from "@/shared/db/schemas";
import { asc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** GET /api/billing/plans — catálogo público de planes (para /pricing y el modal). */
export async function GET() {
  try {
    const plans = await directDb.query.subscriptionPlans.findMany({
      orderBy: [asc(subscriptionPlans.priceMonthly)],
    });
    return NextResponse.json({
      success: true,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        maxProjects: p.maxProjects,
        maxKeywords: p.maxKeywords,
        maxBacklinkChecks: p.maxBacklinkChecks,
        crawlLimitMonthly: p.crawlLimitMonthly,
        features: p.features,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
      })),
    });
  } catch (error) {
    logger.error("GET plans failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
