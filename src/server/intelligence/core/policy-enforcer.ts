import { db } from "@/shared/db";
import {
  projects,
  subscriptions,
  subscriptionPlans,
  users,
  intelligenceUsageEvents
} from "@/shared/db/schemas";
import { eq, and } from "drizzle-orm";
import { IntelligenceToolDefinition } from "../registry/tool-registry";
import crypto from "crypto";
import { checkQuota } from "../enterprise/usage-metering";

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

export interface EnforcePolicyResult {
  allowed: boolean;
  reason?: string;
  planName: string;
}

/**
 * Checks if a project/user has access to a tool based on their subscription plan tier.
 * Records the usage attempt in the database.
 */
export async function enforceToolRunPolicy(
  tool: IntelligenceToolDefinition,
  target: string,
  projectId: string,
  userId?: string
): Promise<EnforcePolicyResult> {
  let planName = "free";

  try {
    // 1. Resolve plan tier from project's active subscription
    const activeSub = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.projectId, projectId),
        eq(subscriptions.status, "active")
      ),
      with: {
        // Assume drizzle relations or join manually
      }
    });

    let resolvedPlan = null;

    if (activeSub) {
      resolvedPlan = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, activeSub.planId)
      });
    }

    // 2. If no active sub on project, check project owner's plan
    if (!resolvedPlan) {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      if (project && project.ownerId) {
        const owner = await db.query.users.findFirst({
          where: eq(users.id, project.ownerId)
        });
        if (owner && owner.planId) {
          resolvedPlan = await db.query.subscriptionPlans.findFirst({
            where: eq(subscriptionPlans.id, owner.planId)
          });
        }
      }
    }

    if (resolvedPlan) {
      planName = resolvedPlan.name.toLowerCase();
    }

    // 3. Perform tier check comparison
    const userTier = PLAN_HIERARCHY[planName] ?? 0;
    const requiredTier = PLAN_HIERARCHY[tool.requiredPlan.toLowerCase()] ?? 0;

    const allowed = userTier >= requiredTier;
    let reason: string | undefined = undefined;

    if (!allowed) {
      reason = `Plan '${planName}' does not support the '${tool.name}' tool. Upgrade to '${tool.requiredPlan}' required.`;
    }

    // Si tiene el tier correcto, revisar la cuota
    if (allowed) {
      const requiredUnits = tool.costUnits || 1;
      const quotaCheck = await checkQuota(projectId, planName, requiredUnits);
      if (!quotaCheck.allowed) {
        return { allowed: false, reason: quotaCheck.reason, planName };
      }
    }

    // 4. Log the usage event in the database
    const targetHash = crypto
      .createHash("sha256")
      .update(target)
      .digest("hex");

    await db.insert(intelligenceUsageEvents).values({
      projectId,
      userId: userId || null,
      toolId: tool.id,
      targetHash,
      units: tool.costUnits || 1,
      allowed,
      reason: reason || null,
    });

    return { allowed, reason, planName };
  } catch (error: any) {
    console.error(`Error in policy enforcer for tool ${tool.id}:`, error);
    // Fallback block/allow gracefully but do not crash the execution flow
    return {
      allowed: false,
      reason: `Operational error checking subscription policy: ${error.message || error}`,
      planName: "free",
    };
  }
}
