import { NextRequest, NextResponse } from "next/server";
import { intelligenceAssets } from "@/shared/db/schemas/intelligence";
import { projects } from "@/shared/db/schemas";
import { eq, and, desc, isNull, count } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { checkIntelScanRateLimit } from "@/shared/lib/ratelimit";
import { runDiscovery } from "@/server/intelligence/discovery/orchestrator";

export const dynamic = "force-dynamic";

// ─── GET: Listar activos descubiertos ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const assetType = searchParams.get("assetType");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId es requerido" }, { status: 400 });
    }

    // Verificar ownership via RLS
    const assets = await withRLS(user.id, async (tx) => {
      // Verificar que el proyecto pertenece al usuario
      const [project] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
        .limit(1);

      if (!project) {
        return null;
      }

      // Construir query de activos
      const conditions = [eq(intelligenceAssets.projectId, projectId)];
      if (assetType) {
        conditions.push(eq(intelligenceAssets.assetType, assetType));
      }

      const assetList = await tx
        .select()
        .from(intelligenceAssets)
        .where(and(...conditions))
        .orderBy(desc(intelligenceAssets.lastSeenAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await tx
        .select({ total: count() })
        .from(intelligenceAssets)
        .where(and(...conditions));

      return {
        assets: assetList,
        total: Number(totalResult?.total || 0),
        project,
      };
    });

    if (assets === null) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      assets: assets.assets,
      total: assets.total,
      project: assets.project,
    });
  } catch (err: unknown) {
    console.error("Error fetching discovered assets:", err);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// ─── POST: Ejecutar descubrimiento manual ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // Rate limit para descubrimiento (30 ejecuciones por minuto por usuario)
    const rateCheck = await checkIntelScanRateLimit(user.id);
    if (!rateCheck.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Límite de descubrimientos excedido. Intenta de nuevo en ${rateCheck.retryAfter} segundos.`,
          retryAfter: rateCheck.retryAfter,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId es requerido" }, { status: 400 });
    }

    // Verificar ownership y obtener dominio
    const projectData = await withRLS(user.id, async (tx) => {
      const [project] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
        .limit(1);
      return project || null;
    });

    if (!projectData) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }

    // Ejecutar descubrimiento de forma asíncrona (no bloquear la respuesta)
    const resultPromise = runDiscovery({
      domain: projectData.domain,
      projectId: projectData.id,
      timeoutMs: 120_000,
      dnsBruteForce: true,
      ctMonitor: true,
      shadowDetection: true,
    });

    // Timeout de 30s para la respuesta HTTP (el discovery completo puede tomar más)
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 28_000)
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);

    if (!result) {
      // Discovery sigue ejecutándose en background
      return NextResponse.json({
        success: true,
        message: "Descubrimiento iniciado. Los resultados estarán disponibles en unos minutos.",
        status: "running",
      });
    }

    return NextResponse.json({
      success: true,
      message: `Descubrimiento completado. ${result.totalNewAssets} activos nuevos encontrados.`,
      status: "completed",
      result: {
        totalNewAssets: result.totalNewAssets,
        totalChanges: result.totalChanges,
        modules: result.modules.map((m) => ({
          moduleId: m.moduleId,
          moduleName: m.moduleName,
          success: m.success,
          assetCount: m.assets.length,
          durationMs: m.durationMs,
          error: m.error,
        })),
      },
    });
  } catch (err: unknown) {
    console.error("Error running discovery:", err);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
