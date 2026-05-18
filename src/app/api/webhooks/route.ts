import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  webhookConfigs
} from "@/shared/db/schemas";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const webhookCreateSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(256),
  url: z.string().url().max(2048),
  events: z.array(z.string()).default(["audit.completed", "alert.triggered"]),
  active: z.boolean().default(true)
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

      const webhooks = await tx.query.webhookConfigs.findMany({
        where: eq(webhookConfigs.projectId, projectId)
      });

      return {
        success: true,
        status: 200,
        data: { webhooks }
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
    console.error("GET webhooks route failure:", error);
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
    const parseResult = webhookCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, error: "Argumentos inválidos" }, { status: 400 });
    }

    const { projectId, name, url, events, active } = parseResult.data;

    const result = await withRLS(user.id, async (tx) => {
      // Check authorization
      const project = await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      if (!project) {
        return { success: false, status: 404, error: "Proyecto no encontrado" };
      }

      // Generate secure random signing secret token
      const secretToken = "whsec_" + crypto.randomBytes(24).toString("hex");

      const [webhook] = await tx.insert(webhookConfigs).values({
        projectId,
        name,
        url,
        secretToken,
        events,
        active
      }).returning();

      return {
        success: true,
        status: 200,
        data: { webhook }
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
    console.error("POST webhooks route failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error interno: ${error.message || error}`
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const projectId = searchParams.get("projectId");

    if (!id || !projectId) {
      return NextResponse.json({ success: false, error: "Faltan parámetros id o projectId" }, { status: 400 });
    }

    const result = await withRLS(user.id, async (tx) => {
      // Check project authorization
      const project = await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      if (!project) {
        return { success: false, status: 404, error: "Proyecto no encontrado" };
      }

      await tx.delete(webhookConfigs).where(
        and(
          eq(webhookConfigs.id, id),
          eq(webhookConfigs.projectId, projectId)
        )
      );

      return {
        success: true,
        status: 200
      };
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true
    });

  } catch (error: any) {
    console.error("DELETE webhooks route failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error interno: ${error.message || error}`
    }, { status: 500 });
  }
}
