import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/shared/lib/supabase/server";
import { requireProjectPermission } from "@/server/lib/project-access";
import { listActions, proposeAction, approveAction, executeAction } from "@/server/lib/remediation/service";
import { CONNECTORS, type RemediationConnector } from "@/server/lib/remediation/connectors";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CONNECTOR_IDS = CONNECTORS.map((c) => c.id);

/**
 * GET /api/remediation?projectId= — lista acciones (report:view).
 * POST — propone (scan:execute). PUT?action=approve|execute (admin+).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "Falta projectId" }, { status: 400 });
    }
    const denied = await requireProjectPermission(user.id, projectId, "report:view");
    if (denied) {
      return NextResponse.json({ success: false, error: denied }, { status: 404 });
    }
    const actions = await listActions(projectId);
    return NextResponse.json({
      success: true,
      actions: actions.map((a) => ({
        id: a.id,
        title: a.title,
        connector: a.connector,
        status: a.status,
        steps: a.steps,
        result: a.result,
        vulnerabilityTitle: a.vulnerabilityTitle,
        createdAt: a.createdAt?.toISOString() ?? null,
      })),
      connectors: CONNECTORS,
    });
  } catch (error) {
    logger.error("GET remediation failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

const proposeSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  connector: z.enum(CONNECTOR_IDS as [RemediationConnector, ...RemediationConnector[]]),
  config: z.record(z.string(), z.string().max(4096)).default({}),
  steps: z.array(z.string().max(500)).max(20).optional(),
  assessmentId: z.string().uuid().optional(),
  vulnerabilityTitle: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const parsed = proposeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }
    const denied = await requireProjectPermission(user.id, parsed.data.projectId, "scan:execute");
    if (denied) {
      return NextResponse.json(
        { success: false, error: denied },
        { status: denied === "Proyecto no encontrado" ? 404 : 403 }
      );
    }
    const id = await proposeAction({ ...parsed.data, createdBy: user.id });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    logger.error("POST remediation failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = z
      .object({ id: z.string().uuid(), op: z.enum(["approve", "execute"]), projectId: z.string().uuid() })
      .safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }
    // Aprobar y ejecutar tocan infraestructura real: admin+.
    const denied = await requireProjectPermission(user.id, parsed.data.projectId, "project:update");
    if (denied) {
      return NextResponse.json(
        { success: false, error: denied },
        { status: denied === "Proyecto no encontrado" ? 404 : 403 }
      );
    }
    if (parsed.data.op === "approve") {
      await approveAction(parsed.data.id);
      return NextResponse.json({ success: true, status: "approved" });
    }
    const result = await executeAction(parsed.data.id);
    return NextResponse.json({ success: true, status: "verified", result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("PUT remediation failure:", { error: message });
    return NextResponse.json({ success: false, error: message.slice(0, 300) }, { status: 500 });
  }
}
