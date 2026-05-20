import { db } from "@/shared/db";
import { intelligenceUsageEvents } from "@/shared/db/schemas";
import { sql, eq, and, gte } from "drizzle-orm";

const QUOTAS_BY_PLAN: Record<string, number> = {
  free: 100,         // 100 cost units per month
  pro: 5000,         // 5000 cost units per month
  business: 50000,   // 50000 cost units per month
  enterprise: 9999999 // Unlimited basically
};

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  remainingUnits: number;
}

/**
 * Checks if the project has enough quota remaining this month to execute the tool.
 * Evaluates the sum of cost units consumed so far this month vs the plan's limit.
 */
export async function checkQuota(
  projectId: string,
  planName: string,
  requiredUnits: number
): Promise<QuotaCheckResult> {
  const planKey = planName.toLowerCase();
  const maxQuota = QUOTAS_BY_PLAN[planKey] ?? QUOTAS_BY_PLAN.free;

  // Si es enterprise o infinito, pasamos rápido
  if (maxQuota >= 9999999) {
    return { allowed: true, remainingUnits: maxQuota };
  }

  // Calcular el inicio del mes actual
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Sumar los costUnits gastados este mes para el proyecto en eventos exitosos/permitidos
  const result = await db
    .select({ totalUsed: sql<number>`SUM(${intelligenceUsageEvents.units})` })
    .from(intelligenceUsageEvents)
    .where(
      and(
        eq(intelligenceUsageEvents.projectId, projectId),
        eq(intelligenceUsageEvents.allowed, true),
        gte(intelligenceUsageEvents.createdAt, startOfMonth)
      )
    );

  const totalUsed = Number(result[0]?.totalUsed || 0);
  const remainingUnits = maxQuota - totalUsed;

  const allowed = remainingUnits >= requiredUnits;
  let reason: string | undefined = undefined;

  if (!allowed) {
    reason = `Quota exceeded for plan '${planName}'. Used ${totalUsed}/${maxQuota} units. Required: ${requiredUnits}.`;
  }

  return { allowed, reason, remainingUnits };
}
