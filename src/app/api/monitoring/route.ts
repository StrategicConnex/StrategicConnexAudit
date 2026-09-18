import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  monitoringSchedules,
  monitoringAlerts
} from "@/shared/db/schemas";
import { eq, desc } from "drizzle-orm";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { withErrorHandler } from "@/server/lib/error-handler";
import { NotFoundError, ValidationError } from "@/server/lib/app-error";

export const dynamic = "force-dynamic";

const scheduleSchema = z.object({
  projectId: z.string().uuid(),
  enabled: z.boolean(),
  interval: z.enum(["daily", "weekly", "monthly"])
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    throw new ValidationError("Falta ID de proyecto");
  }

  const result = await withRLS(user.id, async (tx) => {
    const project = await tx.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    if (!project) {
      throw new NotFoundError("Proyecto", projectId);
    }

    let schedule = await tx.query.monitoringSchedules.findFirst({
      where: eq(monitoringSchedules.projectId, projectId)
    });

    if (!schedule) {
      const [newSchedule] = await tx.insert(monitoringSchedules).values({
        projectId,
        enabled: true,
        interval: "weekly",
        nextRunAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }).returning();
      schedule = newSchedule;
    }

    const alerts = await tx.query.monitoringAlerts.findMany({
      where: eq(monitoringAlerts.projectId, projectId),
      orderBy: [desc(monitoringAlerts.createdAt)]
    });

    return { schedule, alerts };
  });

  return NextResponse.json({ success: true, ...result });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();

  const body = await req.json();
  const parseResult = scheduleSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError("Argumentos inválidos");
  }

  const { projectId, enabled, interval } = parseResult.data;

  const result = await withRLS(user.id, async (tx) => {
    const project = await tx.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    if (!project) {
      throw new NotFoundError("Proyecto", projectId);
    }

    const existing = await tx.query.monitoringSchedules.findFirst({
      where: eq(monitoringSchedules.projectId, projectId)
    });

    let schedule;
    const intervalMs = interval === "daily" ? 24 * 60 * 60 * 1000 : interval === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const nextRunAt = new Date(Date.now() + intervalMs);

    if (existing) {
      const [updated] = await tx.update(monitoringSchedules).set({
        enabled,
        interval,
        nextRunAt,
        updatedAt: new Date()
      }).where(eq(monitoringSchedules.projectId, projectId)).returning();
      schedule = updated;
    } else {
      const [inserted] = await tx.insert(monitoringSchedules).values({
        projectId,
        enabled,
        interval,
        nextRunAt
      }).returning();
      schedule = inserted;
    }

    return { schedule };
  });

  return NextResponse.json({ success: true, ...result });
});
