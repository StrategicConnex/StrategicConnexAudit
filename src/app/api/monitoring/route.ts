import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  monitoringSchedules,
  monitoringAlerts
} from "@/shared/db/schemas";
import { eq, and, desc } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

const scheduleSchema = z.object({
  projectId: z.string().uuid(),
  enabled: z.boolean(),
  interval: z.enum(["daily", "weekly", "monthly"])
});

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ success: false, error: "Falta ID de proyecto" }, { status: 400 });
    }

    const result = await withRLS(user.id, async (tx) => {
      // Check authorization
      const project = await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      if (!project) {
        return { success: false, status: 404, error: "Proyecto no encontrado" };
      }

      // Fetch or initialize schedule
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

      // Fetch alerts
      const alerts = await tx.query.monitoringAlerts.findMany({
        where: eq(monitoringAlerts.projectId, projectId),
        orderBy: [desc(monitoringAlerts.createdAt)]
      });

      return {
        success: true,
        status: 200,
        data: { schedule, alerts }
      };
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      ...result.data
    });

  } catch (error: any) {
    console.error("GET monitoring active route failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error interno: ${error.message || error}`
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = scheduleSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, error: "Argumentos inválidos" }, { status: 400 });
    }

    const { projectId, enabled, interval } = parseResult.data;

    const result = await withRLS(user.id, async (tx) => {
      // Check authorization
      const project = await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      if (!project) {
        return { success: false, status: 404, error: "Proyecto no encontrado" };
      }

      // Upsert schedule
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

      return {
        success: true,
        status: 200,
        data: { schedule }
      };
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      ...result.data
    });

  } catch (error: any) {
    console.error("POST monitoring active route failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error interno: ${error.message || error}`
    }, { status: 500 });
  }
}
