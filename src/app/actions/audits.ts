'use server';

import { authenticatedAction } from "@/shared/lib/actions";
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

    // 4. Trigger background task
    try {
      await tasks.trigger<typeof runProjectAudit>("run-project-audit", {
        projectId,
        auditId: audit.id,
      });
      
      return { success: true, auditId: audit.id };
    } catch (triggerError) {
      console.error("Failed to trigger background task:", triggerError);
      await tx.update(audits)
        .set({ status: 'failed' })
        .where(eq(audits.id, audit.id));
        
      return { success: false, message: "Error al iniciar el motor de análisis." };
    }
  }
);

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
      throw new Error("Auditoría no encontrada");
    }

    // 2. Verify user owns the project
    if (record.project.ownerId !== user.id) {
      throw new Error("Acceso denegado");
    }

    return { success: true, status: record.audit.status };
  }
);