import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import {
  listPluginCatalog,
  installPlugin,
  uninstallPlugin,
  listUserPlugins,
  getPluginPackage,
} from "@/server/intelligence/plugins/registry";
import { registerSinglePluginExecutor } from "@/server/intelligence/plugins/plugin-executor";

export const dynamic = "force-dynamic";

/**
 * GET /api/plugins?view=catalog|installed
 * - catalog: lista todos los plugins del marketplace (default)
 * - installed: lista solo los plugins instalados por el usuario
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") || "catalog";

    if (view === "installed") {
      const installed = await listUserPlugins(user.id);
      return NextResponse.json({ success: true, plugins: installed });
    }

    // Default: catalog view
    const catalog = await listPluginCatalog(user.id);
    return NextResponse.json({ success: true, plugins: catalog });
  } catch (error: any) {
    console.error("GET /api/plugins failure:", error);
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}

/**
 * POST /api/plugins
 * Body: { action: "install" | "uninstall", packageId: string, projectId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { action, packageId, instanceId, projectId } = body;

    if (!action || !packageId) {
      return NextResponse.json({
        success: false,
        error: "Faltan campos requeridos: action, packageId",
      }, { status: 400 });
    }

    if (action === "install") {
      const result = await installPlugin(packageId, user.id, projectId);

      // Registrar el executor del plugin inmediatamente para que esté
      // disponible sin esperar el próximo cold start del dispatcher.
      if (result.success) {
        const pkg = await getPluginPackage(packageId);
        if (pkg) {
          await registerSinglePluginExecutor(pkg.name).catch((err) =>
            console.error(`[Plugin API] Error registrando executor para '${pkg.name}':`, err)
          );
        }
      }

      return NextResponse.json(result);
    }

    if (action === "uninstall") {
      if (!instanceId) {
        return NextResponse.json({
          success: false,
          error: "Falta instanceId para desinstalar",
        }, { status: 400 });
      }
      await uninstallPlugin(instanceId, user.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({
      success: false,
      error: `Acción desconocida: ${action}`,
    }, { status: 400 });
  } catch (error: any) {
    console.error("POST /api/plugins failure:", error);
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}
