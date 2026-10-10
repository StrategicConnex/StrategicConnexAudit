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
import { getErrorMessage } from "@/shared/lib/errors";
import crypto from "crypto";
import { logger } from "@/lib/logger";
import { checkQuota } from "@/server/intelligence/enterprise/usage-metering";

export interface EnforcePolicyResult {
  allowed: boolean;
  reason?: string;
  planName: string;
}

/**
 * Resuelve el plan de suscripción efectivo de un proyecto.
 *
 * FUENTE ÚNICA DE VERDAD del plan: la usan el policy-enforcer (para el gate de
 * tools) y la cola de escaneo (C3, para estampar `plan` en el job y acotar el
 * cupo de concurrencia por plan). Antes vivía dentro de `enforceToolRunPolicy`;
 * se extrajo para que ambos caminos no diverjan.
 *
 * Orden: suscripción activa del proyecto → plan del owner del proyecto → `free`.
 * Nunca lanza: ante un error devuelve `free` (fail-closed, el plan más bajo).
 */
export async function resolveProjectPlan(projectId: string): Promise<string> {
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
  } catch (error: unknown) {
    logger.warn("[policy-enforcer] no se pudo resolver el plan, se asume 'free':", error);
    planName = "free";
  }

  return planName;
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
  try {
    // 1. Resolve plan tier (compartido con la cola de escaneo, C3)
    const planName = await resolveProjectPlan(projectId);

    // A-4: cuota real (antes: allowed=true forzado). Cada herramienta
    // descuenta sus costUnits del plan mensual; al agotarse se bloquea con
    // motivo accionable (upgrade). El evento se registra igual (allowed=false).
    const quota = await checkQuota(projectId, planName, tool.costUnits || 1);
    const allowed = quota.allowed;
    const reason: string | undefined = quota.reason;

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
  } catch (error: unknown) {
    logger.error(`Error in policy enforcer for tool ${tool.id}:`, error);
    // Fallback block/allow gracefully but do not crash the execution flow
    return {
      allowed: false,
      reason: `Error operativo al verificar la política de suscripción: ${getErrorMessage(error)}`,
      planName: "free",
    };
  }
}
