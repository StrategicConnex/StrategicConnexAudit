'use server';

import { ActionState, authenticatedAction } from "@/shared/lib/actions";
import { z } from "zod";
import { db } from "@/shared/db";
import { audits, projects } from "@/shared/db/schemas";
import { eq, and, desc, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import type { runProjectAudit } from "@/trigger/audit.trigger";

const AuditSchema = z.object({
  projectId: z.string().uuid(),
});

export const triggerAudit = authenticatedAction(
  AuditSchema,
  async ({ projectId }, { user, tx }) => {
    // 1. Verify project ownership (Tenant-Isolation Guard)
    const projectResult = await tx
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerId, user.id)
        )
      )
      .limit(1);

    if (projectResult.length === 0) {
      throw new Error("Project not found or access denied");
    }

    // 2. Rate Limiting Guard (30 seconds between audits)
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const [recentAudit] = await tx
      .select({ id: audits.id, createdAt: audits.createdAt })
      .from(audits)
      .where(
        and(
          eq(audits.projectId, projectId),
          gt(audits.createdAt, thirtySecondsAgo)
        )
      )
      .limit(1);

    if (recentAudit) {
      const waitTime = Math.ceil((recentAudit.createdAt!.getTime() + 30000 - Date.now()) / 1000);
      return { 
        success: false, 
        message: `Por favor, espera ${waitTime} segundos antes de iniciar otra auditoría para este proyecto.` 
      };
    }

    // 3. Create audit record
    const [audit] = await tx.insert(audits).values({
      projectId,
      type: "full",
      status: "pending",
      startedAt: new Date(),
      createdBy: user.id,
    }).returning();

    return { success: true, auditId: audit.id, projectId };
  }
);

// We need a wrapper to trigger the task AFTER the transaction finishes
// However, Server Actions are functions. We can't easily hook into the end of authenticatedAction
// unless we modify it or wrap it.

// Let's modify triggerAudit to be a custom function that uses withRLS internally
// but calls tasks.trigger after withRLS finishes.

export const startAuditAction = async (data: z.infer<typeof AuditSchema>): Promise<ActionState<any>> => {
  // We use triggerAudit to handle the DB part (transaction)
  const result = await triggerAudit(data);
  
  if (result.data?.success && result.data.auditId) {
    try {
      await tasks.trigger<typeof runProjectAudit>("run-project-audit", {
        projectId: result.data.projectId!,
        auditId: result.data.auditId,
      });
      return { data: { success: true, auditId: result.data.auditId } };
    } catch (triggerError) {
      console.error("Failed to trigger background task:", triggerError);
      return { error: "Error al iniciar el motor de análisis en segundo plano." };
    }
  }
  
  return result;
};

const StatusSchema = z.object({
  auditId: z.string().uuid(),
});

export const getAuditStatus = authenticatedAction(
  StatusSchema,
  async ({ auditId }, { user, tx }) => {
    // 1. Verify ownership through project relationship
    const result = await tx
      .select({
        audit: audits,
        project: projects,
      })
      .from(audits)
      .where(eq(audits.id, auditId))
      .innerJoin(projects, eq(audits.projectId, projects.id))
      .limit(1);

    const record = result[0];
    if (!record) {
      console.log(`[getAuditStatus] Record NOT FOUND for ID: ${auditId}`);
      return { success: false, message: "Auditoría no encontrada en la base de datos." };
    }

    // 2. Verify user owns the project
    if (record.project.ownerId !== user.id) {
      throw new Error("Acceso denegado");
    }

    return { 
      success: true, 
      status: record.audit.status, 
      errorMessage: record.audit.errorMessage,
      _debug: {
        id: record.audit.id,
        createdAt: record.audit.createdAt,
        dbStatus: record.audit.status
      }
    };
  }
);