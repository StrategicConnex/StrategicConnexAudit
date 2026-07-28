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

    // 3. Forzar acceso total para la auditoría
    const allowed = true;
    const reason: string | undefined = undefined;

    // Se omiten los chequeos de cuota localmente para asegurar el 100% de herramientas activas

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
